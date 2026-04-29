import { File } from 'expo-file-system';
import {
  AbstractAttachmentQueue,
  AttachmentQueueOptions,
  AttachmentRecord,
  AttachmentState
} from '@powersync/attachments';
import { prepareImageForUpload } from '@/utils/imagePrep';
import { generateObjectId } from '@/utils/objectId';
import { debugLogger } from '@/utils/DebugLogger';
import { getClerkInstance } from '@clerk/clerk-expo';
import type { FetchLike, TokenProvider } from '../network/types';

interface QueuePhotoInput {
  sourceUri: string;
  scheduleId: string;
  type: 'before' | 'after' | 'signature' | 'estimate';
  technicianId: string;
  signerName?: string;
  jobTitle: string;
  scheduledStartAtUtc: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceSize?: number;
  mediaType?: string | null;
  fileName?: string | null;
}

interface SignedUploadUrl {
  filename: string;
  fileName?: string;
  photoId?: string;
  apiKey: string;
  timestamp: string;
  signature: string;
  cloudName: string;
  folderPath: string;
  publicId?: string;
  overwrite?: boolean;
  uniqueFilename?: boolean;
  expectedSecureUrl?: string;
}

interface QueuedAttachmentRecord extends AttachmentRecord {
  photoType: string;
  jobTitle: string;
  startDate: string;
  uploadOwner?: string | null;
  uploadClaimedAt?: number | null;
}

type UploadResult =
  | { id: string; secureUrl: string }
  | { id: string; markSynced: true }
  | { id: string; removed: true };

export interface PhotoAttachmentQueueOptions extends AttachmentQueueOptions {
  fetchImpl?: FetchLike;
  tokenProvider?: TokenProvider;
  instanceLabel?: string;
  enableAutomaticProcessing?: boolean;
}

interface ProcessQueueOptions {
  deadlineMs?: number;
  maxBatches?: number;
  triggerSource?: QueueTriggerSource;
  workerRunId?: string;
}

type QueueTriggerSource =
  | 'watch'
  | 'interval/manual-trigger'
  | 'bounded-background-worker'
  | 'unspecified';

interface ProcessQueueResult {
  attempted: number;
  succeeded: number;
  failed: number;
  stoppedBecause: 'empty' | 'deadline' | 'max-batches' | 'already-attempted';
  batchesProcessed: number;
  uniqueAttachmentCount: number;
  repeatAttemptCount: number;
}

export interface QueuePhotoProgress {
  phase: 'preparing' | 'saving';
  current: number;
  total: number;
  action?: 'copy' | 'resize' | 'convert';
}

interface QueuePhotosOptions {
  onProgress?: (progress: QueuePhotoProgress) => void;
}

const MAX_IMAGE_DIMENSION = 2560;
const COPY_AS_IS_MAX_BYTES = 4 * 1024 * 1024;
const HUGE_IMAGE_BYTES = 10 * 1024 * 1024;
const HUGE_IMAGE_DIMENSION = 4000;
const JPEG_NORMAL_QUALITY = 0.9;
const JPEG_HUGE_QUALITY = 0.85;
const UPLOAD_CLAIM_LEASE_MS = 5 * 60 * 1000;

export class PhotoAttachmentQueue extends AbstractAttachmentQueue<PhotoAttachmentQueueOptions> {
  private readonly CONCURRENT_UPLOADS = 10;
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider?: TokenProvider;
  private readonly instanceLabel: string;
  private readonly enableAutomaticProcessing: boolean;
  private isProcessing = false;

  constructor(options: PhotoAttachmentQueueOptions) {
    super(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokenProvider = options.tokenProvider;
    this.instanceLabel = options.instanceLabel ?? 'unknown-queue';
    this.enableAutomaticProcessing = options.enableAutomaticProcessing ?? true;
  }

  async init() {
    if (this.enableAutomaticProcessing) {
      await this.clearUploadClaims('foreground-startup-recovery');
      await super.init();
      return;
    }

    await this.storage.makeDir(this.storageDirectory);
    void debugLogger.debug('UPLOAD', 'Photo queue initialized in manual-only mode', {
      queueInstance: this.instanceLabel
    });
  }

  onAttachmentIdsChange(_onUpdate: (ids: string[]) => void): void {
    // Attachments are local-only; no remote ID tracking needed.
  }

  watchUploads(): void {
    this.idsToUpload((ids) => {
      if (ids.length > 0) {
        void debugLogger.debug('UPLOAD', 'Photo queue triggered by watch', {
          queueInstance: this.instanceLabel,
          queuedIds: ids.length
        });
        void this.processQueue({ triggerSource: 'watch' });
      }
    });
  }

  trigger(): void {
    void debugLogger.debug('UPLOAD', 'Photo queue triggered by interval/manual trigger', {
      queueInstance: this.instanceLabel
    });
    void this.processQueue({ triggerSource: 'interval/manual-trigger' });
    void this.expireCache();
  }

  async newAttachmentRecord(record?: Partial<AttachmentRecord>): Promise<AttachmentRecord> {
    const id = record?.id ?? generateObjectId();
    const filename = record?.filename ?? `${id}.jpg`;

    return {
      id,
      filename,
      local_uri: record?.local_uri,
      media_type: record?.media_type,
      size: record?.size,
      state: record?.state ?? AttachmentState.QUEUED_UPLOAD
    };
  }

  async queuePhotos(photos: QueuePhotoInput[], options?: QueuePhotosOptions): Promise<string[]> {
    if (!photos || photos.length === 0) return [];

    const startedAt = Date.now();
    const timestamp = new Date().toISOString();
    const total = photos.length;
    const preparedFiles: Array<{
      id: string;
      filename: string;
      localPath: string;
      mediaType: string;
      size?: number;
      photo: QueuePhotoInput;
    }> = [];

    for (const [index, photo] of photos.entries()) {
      const photoStartedAt = Date.now();
      const id = generateObjectId();
      const shouldCopyOriginal = this.shouldCopyOriginal(photo);
      const ext = photo.type === 'signature' ? 'png' : 'jpg';
      const filename = `${id}.${ext}`;
      const localPath = this.getLocalFilePathSuffix(filename);
      const destinationUri = this.getLocalUri(localPath);

      options?.onProgress?.({
        phase: 'preparing',
        current: index + 1,
        total,
        action: shouldCopyOriginal ? 'copy' : this.getPreparationAction(photo)
      });

      let sourceToCopy = photo.sourceUri;
      let size = photo.sourceSize;

      if (!shouldCopyOriginal) {
        const prepared = await prepareImageForUpload(photo.sourceUri, {
          format: photo.type === 'signature' ? 'png' : 'jpeg',
          sourceWidth: photo.sourceWidth,
          sourceHeight: photo.sourceHeight,
          maxDimension: MAX_IMAGE_DIMENSION,
          compress: photo.type === 'signature' ? 1.0 : this.getJpegQuality(photo)
        });

        sourceToCopy = prepared.uri;
        size = prepared.size;
      }

      await this.storage.copyFile(sourceToCopy, destinationUri);

      if (sourceToCopy !== photo.sourceUri) {
        try {
          const tempFile = new File(sourceToCopy);
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
        mediaType: photo.type === 'signature' ? 'image/png' : 'image/jpeg',
        size,
        photo
      });

      void debugLogger.debug('UPLOAD', 'Prepared photo for queue', {
        id,
        action: shouldCopyOriginal ? 'copy' : this.getPreparationAction(photo),
        elapsedMs: Date.now() - photoStartedAt,
        sourceSize: photo.sourceSize,
        queuedSize: size,
        sourceWidth: photo.sourceWidth,
        sourceHeight: photo.sourceHeight
      });
    }

    options?.onProgress?.({
      phase: 'saving',
      current: total,
      total
    });

    await this.powersync.writeTransaction(async (tx) => {
      for (const { id, filename, localPath, mediaType, size, photo } of preparedFiles) {
        await tx.execute(
          `INSERT INTO photos (id, scheduleId, cloudinaryUrl, type, technicianId, timestamp, signerName)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
          [
            id,
            photo.scheduleId,
            photo.type,
            photo.technicianId,
            timestamp,
            photo.signerName || null
          ]
        );

        await tx.execute(
          `INSERT INTO ${this.table} (id, timestamp, filename, local_uri, media_type, size, state, scheduleId, photoType, jobTitle, startDate, uploadOwner, uploadClaimedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
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
            photo.scheduledStartAtUtc
          ]
        );
      }
    });

    void debugLogger.info('UPLOAD', 'Queued photos for upload', {
      count: preparedFiles.length,
      elapsedMs: Date.now() - startedAt
    });

    return preparedFiles.map((file) => file.id);
  }

  private shouldCopyOriginal(photo: QueuePhotoInput): boolean {
    if (photo.type === 'signature') {
      return false;
    }

    if (!photo.sourceWidth || !photo.sourceHeight) {
      return false;
    }

    const maxDimension = Math.max(photo.sourceWidth, photo.sourceHeight);
    const size = photo.sourceSize ?? Number.POSITIVE_INFINITY;

    return (
      this.isJpegSource(photo) &&
      size <= COPY_AS_IS_MAX_BYTES &&
      maxDimension <= MAX_IMAGE_DIMENSION
    );
  }

  private getPreparationAction(photo: QueuePhotoInput): QueuePhotoProgress['action'] {
    if (!this.isJpegSource(photo) || photo.type === 'signature') {
      return 'convert';
    }

    return 'resize';
  }

  private getJpegQuality(photo: QueuePhotoInput): number {
    const maxDimension = Math.max(photo.sourceWidth ?? 0, photo.sourceHeight ?? 0);
    const size = photo.sourceSize ?? 0;

    if (size > HUGE_IMAGE_BYTES || maxDimension > HUGE_IMAGE_DIMENSION) {
      return JPEG_HUGE_QUALITY;
    }

    return JPEG_NORMAL_QUALITY;
  }

  private isJpegSource(photo: QueuePhotoInput): boolean {
    const mediaType = photo.mediaType?.toLowerCase() ?? '';
    const fileName = photo.fileName?.toLowerCase() ?? '';
    const sourceUri = photo.sourceUri.toLowerCase();

    return (
      mediaType === 'image/jpeg' ||
      mediaType === 'image/jpg' ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      sourceUri.endsWith('.jpg') ||
      sourceUri.endsWith('.jpeg')
    );
  }

  async processQueue(options?: ProcessQueueOptions): Promise<ProcessQueueResult> {
    const triggerSource = options?.triggerSource ?? 'unspecified';
    const workerRunId = options?.workerRunId;

    if (this.isProcessing) {
      void debugLogger.debug('UPLOAD', 'Photo queue process skipped because another run is active', {
        queueInstance: this.instanceLabel,
        triggerSource,
        workerRunId
      });
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        stoppedBecause: 'empty',
        batchesProcessed: 0,
        uniqueAttachmentCount: 0,
        repeatAttemptCount: 0
      };
    }

    const deadlineMs = options?.deadlineMs;
    const maxBatches = options?.maxBatches;
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let processedBatches = 0;
    let stoppedBecause: ProcessQueueResult['stoppedBecause'] = 'empty';
    let repeatAttemptCount = 0;
    const uniqueAttachmentIds = new Set<string>();
    const attachmentAttemptCounts = new Map<string, number>();
    const uploadRunOwner = `${this.instanceLabel}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    this.isProcessing = true;

    try {
      void debugLogger.info('UPLOAD', 'Photo queue processing started', {
        queueInstance: this.instanceLabel,
        triggerSource,
        workerRunId,
        deadlineMs,
        maxBatches
      });

      while (true) {
        if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
          stoppedBecause = 'deadline';
          break;
        }

        if (maxBatches !== undefined && processedBatches >= maxBatches) {
          stoppedBecause = 'max-batches';
          break;
        }

        const attemptedIds = Array.from(attachmentAttemptCounts.keys());
        const excludeAttemptedClause =
          attemptedIds.length > 0 ? ` AND id NOT IN (${attemptedIds.map(() => '?').join(', ')})` : '';
        const staleClaimBefore = Date.now() - UPLOAD_CLAIM_LEASE_MS;
        const queuedCandidates = await this.powersync.getAll<QueuedAttachmentRecord>(
          `SELECT id, filename, local_uri, media_type, photoType, jobTitle, startDate, uploadOwner, uploadClaimedAt
                     FROM ${this.table}
                     WHERE (state = ? OR state = ?)
                       AND (uploadOwner IS NULL OR uploadClaimedAt IS NULL OR uploadClaimedAt < ?)
                       ${excludeAttemptedClause}
                     LIMIT ?`,
          [
            AttachmentState.QUEUED_UPLOAD,
            AttachmentState.QUEUED_SYNC,
            staleClaimBefore,
            ...attemptedIds,
            this.CONCURRENT_UPLOADS
          ]
        );

        const queued = await this.claimQueuedAttachments(queuedCandidates, uploadRunOwner);

        if (queued.length === 0) {
          if (attemptedIds.length > 0) {
            const remainingQueuedRows = await this.powersync.getAll<{ count: number }>(
              `SELECT COUNT(*) as count
                         FROM ${this.table}
                         WHERE state = ? OR state = ?`,
              [AttachmentState.QUEUED_UPLOAD, AttachmentState.QUEUED_SYNC]
            );
            const remainingQueuedCount = Number(remainingQueuedRows[0]?.count ?? 0);

            if (remainingQueuedCount > 0) {
              stoppedBecause = 'already-attempted';
              void debugLogger.info('UPLOAD', 'Photo queue stopped after exhausting unique attempts for this run', {
                queueInstance: this.instanceLabel,
                triggerSource,
                workerRunId,
                attemptedAttachmentCount: attemptedIds.length,
                remainingQueuedCount
              });
              break;
            }
          }

          if (queuedCandidates.length > 0) {
            stoppedBecause = 'already-attempted';
            void debugLogger.info('UPLOAD', 'Photo queue skipped rows claimed by another runner', {
              queueInstance: this.instanceLabel,
              triggerSource,
              workerRunId,
              candidateCount: queuedCandidates.length
            });
            break;
          }

          stoppedBecause = 'empty';
          break;
        }

        processedBatches += 1;
        attempted += queued.length;
        const batchQueuedIds = queued.map((attachment) => attachment.id);

        for (const attachment of queued) {
          const previousAttempts = attachmentAttemptCounts.get(attachment.id) ?? 0;
          repeatAttemptCount += previousAttempts;

          uniqueAttachmentIds.add(attachment.id);
          attachmentAttemptCounts.set(attachment.id, previousAttempts + 1);
        }

        void debugLogger.debug('UPLOAD', 'Photo queue batch selected queued attachments', {
          queueInstance: this.instanceLabel,
          triggerSource,
          workerRunId,
          batchNumber: processedBatches,
          queuedCount: queued.length,
          queuedIds: batchQueuedIds,
          excludedAttemptedIdsCount: attemptedIds.length
        });

        // Get all signed URLs in one batch request
        const signedUrls = await this.getBatchSignedUploadUrls(
          queued.map((att) => ({
            photoId: att.id,
            fileName: att.filename,
            mediaType: att.media_type || 'image/jpeg',
            type: att.photoType,
            jobTitle: att.jobTitle,
            startDate: att.startDate
          }))
        );

        // Create map for lookup
        const urlMap = new Map(signedUrls.map((s) => [s.filename ?? s.fileName ?? '', s]));

        // Upload in parallel with pre-fetched signed URLs
        const uploadResults = await Promise.allSettled(
          queued.map((att) => {
            const signedUrl = urlMap.get(att.filename);
            if (!signedUrl) {
              return Promise.reject(new Error(`No signed URL for ${att.filename}`));
            }
            return this.uploadToCloudinary(att, signedUrl);
          })
        );

        const photoUpdates: Array<{ id: string; secureUrl: string }> = [];
        const syncedIds: string[] = [];
        const failedIds: string[] = [];

        for (const [index, result] of uploadResults.entries()) {
          if (result.status !== 'fulfilled') {
            const attachment = queued[index];
            const reason =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            void debugLogger.warn('UPLOAD', 'Photo upload attempt failed; leaving queued for retry', {
              queueInstance: this.instanceLabel,
              triggerSource,
              workerRunId,
              batchNumber: processedBatches,
              id: attachment?.id,
              filename: attachment?.filename,
              reason
            });
            failed += 1;
            if (attachment?.id) {
              failedIds.push(attachment.id);
            }
            continue;
          }
          const value = result.value;
          if ('secureUrl' in value) {
            photoUpdates.push({
              id: value.id,
              secureUrl: value.secureUrl
            });
            syncedIds.push(value.id);
            succeeded += 1;
          } else if ('markSynced' in value) {
            syncedIds.push(value.id);
            succeeded += 1;
          } else if ('removed' in value) {
            succeeded += 1;
          }
        }

        if (photoUpdates.length > 0 || syncedIds.length > 0) {
          await this.powersync.writeTransaction(async (tx) => {
            for (const update of photoUpdates) {
              await tx.execute(`UPDATE photos SET cloudinaryUrl = ? WHERE id = ?`, [
                update.secureUrl,
                update.id
              ]);
            }
            for (const id of syncedIds) {
              await tx.execute(`UPDATE ${this.table} SET state = ?, uploadOwner = NULL, uploadClaimedAt = NULL WHERE id = ?`, [
                AttachmentState.SYNCED,
                id
              ]);
            }
          });
        }

        if (failedIds.length > 0) {
          await this.releaseUploadClaims(failedIds, uploadRunOwner);
        }

        void debugLogger.debug('UPLOAD', 'Photo queue batch processed', {
          queueInstance: this.instanceLabel,
          triggerSource,
          workerRunId,
          batchNumber: processedBatches,
          attemptedThisBatch: queued.length,
          succeededThisBatch: syncedIds.length,
          failedThisBatch: queued.length - syncedIds.length
        });
      }
    } finally {
      this.isProcessing = false;

      void debugLogger.info('UPLOAD', 'Photo queue processing complete', {
        queueInstance: this.instanceLabel,
        triggerSource,
        workerRunId,
        attempted,
        succeeded,
        failed,
        stoppedBecause,
        batchesProcessed: processedBatches,
        uniqueAttachmentCount: uniqueAttachmentIds.size,
        repeatAttemptCount
      });
    }

    return {
      attempted,
      succeeded,
      failed,
      stoppedBecause,
      batchesProcessed: processedBatches,
      uniqueAttachmentCount: uniqueAttachmentIds.size,
      repeatAttemptCount
    };
  }

  private async uploadToCloudinary(
    attachment: AttachmentRecord,
    signedUrl: SignedUploadUrl
  ): Promise<UploadResult> {
    const startedAt = Date.now();
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
      attachment.local_uri || this.getLocalFilePathSuffix(attachment.filename)
    );

    const hasFile = await this.storage.fileExists(localUri);
    if (!hasFile) {
      throw new Error(`Local file missing for ${attachment.id}`);
    }

    const uploadFile = new File(localUri);
    const formData = new FormData();
    formData.append('file', uploadFile, attachment.filename);
    formData.append('api_key', signedUrl.apiKey);
    formData.append('timestamp', signedUrl.timestamp);
    formData.append('signature', signedUrl.signature);
    formData.append('folder', signedUrl.folderPath);
    if (signedUrl.publicId) {
      formData.append('public_id', signedUrl.publicId);
    }
    if (signedUrl.overwrite !== undefined) {
      formData.append('overwrite', signedUrl.overwrite ? 'true' : 'false');
    }
    if (signedUrl.uniqueFilename !== undefined) {
      formData.append('unique_filename', signedUrl.uniqueFilename ? 'true' : 'false');
    }

    const uploadResponse = await this.fetchImpl(
      `https://api.cloudinary.com/v1_1/${signedUrl.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    const responseData = await uploadResponse.json();
    if (!uploadResponse.ok) {
      if (signedUrl.expectedSecureUrl && this.isDuplicateCloudinaryUpload(responseData)) {
        void debugLogger.info('UPLOAD', 'Cloudinary upload already exists; treating as success', {
          id: attachment.id,
          filename: attachment.filename,
          status: uploadResponse.status,
          elapsedMs: Date.now() - startedAt
        });
        return { id: attachment.id, secureUrl: signedUrl.expectedSecureUrl };
      }

      throw new Error(
        `Cloudinary upload failed: ${uploadResponse.status} ${this.getCloudinaryErrorMessage(responseData)}`
      );
    }

    const secureUrl = responseData?.secure_url as string | undefined;

    if (!secureUrl) {
      throw new Error('Cloudinary response missing secure_url');
    }

    void debugLogger.debug('UPLOAD', 'Cloudinary upload completed', {
      id: attachment.id,
      filename: attachment.filename,
      elapsedMs: Date.now() - startedAt
    });

    return { id: attachment.id, secureUrl };
  }

  private isDuplicateCloudinaryUpload(responseData: unknown): boolean {
    const message = this.getCloudinaryErrorMessage(responseData).toLowerCase();
    return (
      message.includes('already exists') ||
      message.includes('duplicate') ||
      message.includes('public id')
    );
  }

  private getCloudinaryErrorMessage(responseData: unknown): string {
    if (
      typeof responseData === 'object' &&
      responseData !== null &&
      'error' in responseData &&
      typeof responseData.error === 'object' &&
      responseData.error !== null &&
      'message' in responseData.error
    ) {
      const message = responseData.error.message;
      return typeof message === 'string' ? message : '';
    }

    return '';
  }

  private async claimQueuedAttachments(
    candidates: QueuedAttachmentRecord[],
    uploadRunOwner: string
  ): Promise<QueuedAttachmentRecord[]> {
    if (candidates.length === 0) {
      return [];
    }

    const now = Date.now();
    const staleClaimBefore = now - UPLOAD_CLAIM_LEASE_MS;

    await this.powersync.writeTransaction(async (tx) => {
      for (const attachment of candidates) {
        await tx.execute(
          `UPDATE ${this.table}
             SET uploadOwner = ?, uploadClaimedAt = ?
           WHERE id = ?
             AND (state = ? OR state = ?)
             AND (uploadOwner IS NULL OR uploadClaimedAt IS NULL OR uploadClaimedAt < ?)`,
          [
            uploadRunOwner,
            now,
            attachment.id,
            AttachmentState.QUEUED_UPLOAD,
            AttachmentState.QUEUED_SYNC,
            staleClaimBefore
          ]
        );
      }
    });

    const candidateIds = candidates.map((attachment) => attachment.id);
    const claimed = await this.powersync.getAll<QueuedAttachmentRecord>(
      `SELECT id, filename, local_uri, media_type, photoType, jobTitle, startDate, uploadOwner, uploadClaimedAt
         FROM ${this.table}
        WHERE uploadOwner = ?
          AND id IN (${candidateIds.map(() => '?').join(', ')})`,
      [uploadRunOwner, ...candidateIds]
    );

    if (claimed.length !== candidates.length) {
      void debugLogger.info('UPLOAD', 'Photo queue claimed partial batch', {
        queueInstance: this.instanceLabel,
        requestedCount: candidates.length,
        claimedCount: claimed.length,
        uploadRunOwner
      });
    }

    return claimed;
  }

  private async releaseUploadClaims(ids: string[], uploadRunOwner: string): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.powersync.execute(
      `UPDATE ${this.table}
          SET uploadOwner = NULL, uploadClaimedAt = NULL
        WHERE uploadOwner = ?
          AND id IN (${ids.map(() => '?').join(', ')})`,
      [uploadRunOwner, ...ids]
    );
  }

  private async clearUploadClaims(reason: string): Promise<void> {
    await this.powersync.execute(
      `UPDATE ${this.table}
          SET uploadOwner = NULL, uploadClaimedAt = NULL
        WHERE (state = ? OR state = ?)
          AND uploadOwner IS NOT NULL`,
      [AttachmentState.QUEUED_UPLOAD, AttachmentState.QUEUED_SYNC]
    );

    void debugLogger.info('UPLOAD', 'Cleared upload claims for recovery', {
      queueInstance: this.instanceLabel,
      reason
    });
  }

  private async markAsSynced(id: string): Promise<void> {
    await this.powersync.execute(
      `UPDATE ${this.table}
          SET state = ?, uploadOwner = NULL, uploadClaimedAt = NULL
        WHERE id = ?`,
      [AttachmentState.SYNCED, id]
    );
  }

  private async removeAttachment(attachment: AttachmentRecord): Promise<void> {
    await this.powersync.execute(`DELETE FROM ${this.table} WHERE id = ?`, [attachment.id]);

    const localUri = this.getLocalUri(
      attachment.local_uri || this.getLocalFilePathSuffix(attachment.filename)
    );

    try {
      await this.storage.deleteFile(localUri);
    } catch {
      // Ignore cleanup errors.
    }
  }

  private async getBatchSignedUploadUrls(
    files: Array<{
      photoId: string;
      fileName: string;
      mediaType: string;
      type: string;
      jobTitle: string;
      startDate: string;
    }>
  ): Promise<SignedUploadUrl[]> {
    const startedAt = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    const token = await this.getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await this.fetchImpl(`${process.env.EXPO_PUBLIC_API_URL}/api/cloudinaryUpload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ files })
    });
    if (!response.ok) {
      throw new Error('Failed to get batch signed URLs');
    }
    const data = await response.json();
    void debugLogger.debug('UPLOAD', 'Fetched Cloudinary signed upload URLs', {
      count: files.length,
      elapsedMs: Date.now() - startedAt
    });
    return data.signedUrls;
  }

  private async getAuthToken(): Promise<string | null> {
    if (this.tokenProvider) {
      try {
        const providedToken = await this.tokenProvider();
        if (providedToken) {
          return providedToken;
        }
      } catch {
        // Fall back to Clerk below.
      }
    }

    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
      });
      const token = await clerk?.session?.getToken({
        template: 'Powersync',
        skipCache: false
      });
      return token ?? null;
    } catch {
      // Proceed without auth header if token fetch fails.
      return null;
    }
  }
}
