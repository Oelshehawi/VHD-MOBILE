import { File } from "expo-file-system";
import {
    AbstractAttachmentQueue,
    AttachmentRecord,
    AttachmentState,
} from "@powersync/attachments";
import { prepareImageForUpload } from "@/utils/imagePrep";
import { generateObjectId } from "@/utils/objectId";
import { getClerkInstance } from "@clerk/clerk-expo";

interface QueuePhotoInput {
    sourceUri: string;
    scheduleId: string;
    type: "before" | "after" | "signature" | "estimate";
    technicianId: string;
    signerName?: string;
    jobTitle: string;
    startDate: string;
}

interface SignedUploadUrl {
    filename: string;
    fileName?: string;
    apiKey: string;
    timestamp: string;
    signature: string;
    cloudName: string;
    folderPath: string;
}

interface QueuedAttachmentRecord extends AttachmentRecord {
    photoType: string;
    jobTitle: string;
    startDate: string;
}

type UploadResult =
    | { id: string; secureUrl: string }
    | { id: string; markSynced: true }
    | { id: string; removed: true };

export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
    private readonly CONCURRENT_UPLOADS = 10;
    private isProcessing = false;

    async init() {
        await super.init();
    }

    onAttachmentIdsChange(_onUpdate: (ids: string[]) => void): void {
        // Attachments are local-only; no remote ID tracking needed.
    }

    watchUploads(): void {
        this.idsToUpload((ids) => {
            if (ids.length > 0) {
                void this.processQueue();
            }
        });
    }

    trigger(): void {
        void this.processQueue();
        void this.expireCache();
    }

    async newAttachmentRecord(
        record?: Partial<AttachmentRecord>,
    ): Promise<AttachmentRecord> {
        const id = record?.id ?? generateObjectId();
        const filename = record?.filename ?? `${id}.jpg`;

        return {
            id,
            filename,
            local_uri: record?.local_uri,
            media_type: record?.media_type,
            size: record?.size,
            state: record?.state ?? AttachmentState.QUEUED_UPLOAD,
        };
    }

    async queuePhotos(photos: QueuePhotoInput[]): Promise<string[]> {
        if (!photos || photos.length === 0) return [];

        const timestamp = new Date().toISOString();
        const preparedFiles: Array<{
            id: string;
            filename: string;
            localPath: string;
            mediaType: string;
            size?: number;
            photo: QueuePhotoInput;
        }> = [];

        for (const photo of photos) {
            const id = generateObjectId();
            const ext = photo.type === "signature" ? "png" : "jpg";
            const filename = `${id}.${ext}`;
            const localPath = this.getLocalFilePathSuffix(filename);
            const destinationUri = this.getLocalUri(localPath);

            const prepared = await prepareImageForUpload(photo.sourceUri, {
                format: photo.type === "signature" ? "png" : "jpeg",
            });

            await this.storage.copyFile(prepared.uri, destinationUri);

            if (prepared.uri !== photo.sourceUri) {
                try {
                    const tempFile = new File(prepared.uri);
                    if (tempFile.exists) {
                        tempFile.delete();
                    }
                } catch {
                    // Ignore temp cleanup errors.
                }
            }

            preparedFiles.push({
                id,
                filename,
                localPath,
                mediaType:
                    photo.type === "signature" ? "image/png" : "image/jpeg",
                size: prepared.size,
                photo,
            });
        }

        await this.powersync.writeTransaction(async (tx) => {
            for (const {
                id,
                filename,
                localPath,
                mediaType,
                size,
                photo,
            } of preparedFiles) {
                await tx.execute(
                    `INSERT INTO photos (id, scheduleId, cloudinaryUrl, type, technicianId, timestamp, signerName)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
                    [
                        id,
                        photo.scheduleId,
                        photo.type,
                        photo.technicianId,
                        timestamp,
                        photo.signerName || null,
                    ],
                );

                await tx.execute(
                    `INSERT INTO ${this.table} (id, timestamp, filename, local_uri, media_type, size, state, scheduleId, photoType, jobTitle, startDate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        Date.now(),
                        filename,
                        localPath,
                        mediaType,
                        size ?? null,
                        AttachmentState.QUEUED_UPLOAD,
                        photo.scheduleId,
                        photo.type,
                        photo.jobTitle,
                        photo.startDate,
                    ],
                );
            }
        });

        return preparedFiles.map((file) => file.id);
    }

    async processQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (true) {
                const queued =
                    await this.powersync.getAll<QueuedAttachmentRecord>(
                        `SELECT id, filename, local_uri, media_type, photoType, jobTitle, startDate
                     FROM ${this.table}
                     WHERE state = ? OR state = ?
                     LIMIT ?`,
                        [
                            AttachmentState.QUEUED_UPLOAD,
                            AttachmentState.QUEUED_SYNC,
                            this.CONCURRENT_UPLOADS,
                        ],
                    );

                if (queued.length === 0) break;

                // Get all signed URLs in one batch request
                const signedUrls = await this.getBatchSignedUploadUrls(
                    queued.map((att) => ({
                        fileName: att.filename,
                        mediaType: att.media_type || "image/jpeg",
                        type: att.photoType,
                        jobTitle: att.jobTitle,
                        startDate: att.startDate,
                    })),
                );

                // Create map for lookup
                const urlMap = new Map(
                    signedUrls.map((s) => [s.filename ?? s.fileName ?? "", s]),
                );

                // Upload in parallel with pre-fetched signed URLs
                const uploadResults = await Promise.allSettled(
                    queued.map((att) => {
                        const signedUrl = urlMap.get(att.filename);
                        if (!signedUrl) {
                            return Promise.reject(
                                new Error(`No signed URL for ${att.filename}`),
                            );
                        }
                        return this.uploadToCloudinary(att, signedUrl);
                    }),
                );

                const photoUpdates: Array<{ id: string; secureUrl: string }> =
                    [];
                const syncedIds: string[] = [];

                for (const result of uploadResults) {
                    if (result.status !== "fulfilled") continue;
                    const value = result.value;
                    if ("secureUrl" in value) {
                        photoUpdates.push({
                            id: value.id,
                            secureUrl: value.secureUrl,
                        });
                        syncedIds.push(value.id);
                    } else if ("markSynced" in value) {
                        syncedIds.push(value.id);
                    }
                }

                if (photoUpdates.length > 0 || syncedIds.length > 0) {
                    await this.powersync.writeTransaction(async (tx) => {
                        for (const update of photoUpdates) {
                            await tx.execute(
                                `UPDATE photos SET cloudinaryUrl = ? WHERE id = ?`,
                                [update.secureUrl, update.id],
                            );
                        }
                        for (const id of syncedIds) {
                            await tx.execute(
                                `UPDATE ${this.table} SET state = ? WHERE id = ?`,
                                [AttachmentState.SYNCED, id],
                            );
                        }
                    });
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async uploadToCloudinary(
        attachment: AttachmentRecord,
        signedUrl: SignedUploadUrl,
    ): Promise<UploadResult> {
        const [photo] = await this.powersync.getAll<{
            cloudinaryUrl: string | null;
        }>(`SELECT cloudinaryUrl FROM photos WHERE id = ?`, [attachment.id]);

        if (!photo) {
            await this.removeAttachment(attachment);
            return { id: attachment.id, removed: true };
        }

        if (photo.cloudinaryUrl) {
            return { id: attachment.id, markSynced: true };
        }

        const localUri = this.getLocalUri(
            attachment.local_uri ||
                this.getLocalFilePathSuffix(attachment.filename),
        );

        const hasFile = await this.storage.fileExists(localUri);
        if (!hasFile) {
            throw new Error(`Local file missing for ${attachment.id}`);
        }

        const formData = new FormData();
        formData.append("file", {
            uri: localUri,
            type: attachment.media_type || "image/jpeg",
            name: attachment.filename,
        } as any);
        formData.append("api_key", signedUrl.apiKey);
        formData.append("timestamp", signedUrl.timestamp);
        formData.append("signature", signedUrl.signature);
        formData.append("folder", signedUrl.folderPath);

        const uploadResponse = await fetch(
            `https://api.cloudinary.com/v1_1/${signedUrl.cloudName}/image/upload`,
            { method: "POST", body: formData },
        );

        if (!uploadResponse.ok) {
            throw new Error(
                `Cloudinary upload failed: ${uploadResponse.status}`,
            );
        }

        const responseData = await uploadResponse.json();
        const secureUrl = responseData?.secure_url as string | undefined;

        if (!secureUrl) {
            throw new Error("Cloudinary response missing secure_url");
        }

        return { id: attachment.id, secureUrl };
    }

    private async markAsSynced(id: string): Promise<void> {
        await this.powersync.execute(
            `UPDATE ${this.table} SET state = ? WHERE id = ?`,
            [AttachmentState.SYNCED, id],
        );
    }

    private async removeAttachment(
        attachment: AttachmentRecord,
    ): Promise<void> {
        await this.powersync.execute(`DELETE FROM ${this.table} WHERE id = ?`, [
            attachment.id,
        ]);

        const localUri = this.getLocalUri(
            attachment.local_uri ||
                this.getLocalFilePathSuffix(attachment.filename),
        );

        try {
            await this.storage.deleteFile(localUri);
        } catch {
            // Ignore cleanup errors.
        }
    }

    private async getBatchSignedUploadUrls(
        files: Array<{
            fileName: string;
            mediaType: string;
            type: string;
            jobTitle: string;
            startDate: string;
        }>,
    ): Promise<SignedUploadUrl[]> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        try {
            const clerk = getClerkInstance({
                publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
            });
            const token = await clerk?.session?.getToken({
                template: "Powersync",
                skipCache: false,
            });
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
        } catch {
            // Proceed without auth header if token fetch fails.
        }

        const response = await fetch(
            `${process.env.EXPO_PUBLIC_API_URL}/api/cloudinaryUpload`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({ files }),
            },
        );
        if (!response.ok) {
            throw new Error("Failed to get batch signed URLs");
        }
        const data = await response.json();
        return data.signedUrls;
    }
}
