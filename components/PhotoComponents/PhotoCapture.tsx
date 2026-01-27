import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator } from "expo-image-manipulator";
import { PhotoGrid } from "./PhotoGrid";
import { PhotoCaptureModal } from "./PhotoCaptureModal";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { PhotoType, showToast } from "@/utils/photos";
import {
    usePowerSync,
    useQuery,
    DEFAULT_ROW_COMPARATOR,
} from "@powersync/react-native";
import { useSystem } from "@/services/database/System";
import { DeletePhotoModal } from "./DeletePhotoModal";
import { LoadingModal } from "./LoadingModal";
import { FastImageViewer } from "@/components/common/FastImageViewer";
import { File, Paths } from "expo-file-system";
import { AttachmentRecord } from "@powersync/attachments";

interface PhotoCaptureProps {
    technicianId: string;
    type: "before" | "after";
    jobTitle: string;
    startDate: string;
    scheduleId?: string;
    isLoading?: boolean;
}

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

export function PhotoCapture({
    technicianId,
    type,
    scheduleId,
    jobTitle,
    startDate,
    isLoading: externalLoading = false,
}: PhotoCaptureProps) {
    const powerSync = usePowerSync();
    const system = useSystem();

    const [showModal, setShowModal] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [photoToDelete, setPhotoToDelete] = useState<{ id: string } | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [galleryImages, setGalleryImages] = useState<
        { uri: string; title?: string; type?: string }[]
    >([]);

    const { data: photos = [], isLoading: isQueryLoading } =
        useQuery<PhotoType>(
            scheduleId
                ? `SELECT p.id, p.scheduleId, p.cloudinaryUrl, p.type, p.technicianId, p.timestamp, p.signerName,
           a.local_uri, a.filename
         FROM photos p
         LEFT JOIN attachments a ON a.id = p.id
         WHERE p.scheduleId = ? AND p.type = ?
         ORDER BY p.timestamp ASC`
                : `SELECT p.id FROM photos p WHERE 0`,
            [scheduleId || "", type],
            { rowComparator: DEFAULT_ROW_COMPARATOR },
        );

    const resolvePhotoUrl = useCallback(
        (photo: PhotoType): string => {
            if (photo.cloudinaryUrl === null && system?.attachmentQueue) {
                if (photo.local_uri) {
                    return system.attachmentQueue.getLocalUri(photo.local_uri);
                }

                if (photo.filename) {
                    return new File(
                        Paths.document,
                        "attachments",
                        photo.filename,
                    ).uri;
                }
            }

            return photo.cloudinaryUrl || "";
        },
        [system?.attachmentQueue],
    );

    const prepareGalleryImages = useCallback(() => {
        return photos.map((photo) => ({
            uri: resolvePhotoUrl(photo),
            title: `${type === "before" ? "Before" : "After"} Photo`,
            type: type,
        }));
    }, [photos, type, resolvePhotoUrl]);

    const handlePhotoPress = (index: number) => {
        setShowModal(false);
        setPhotoToDelete(null);

        const images = prepareGalleryImages();
        setGalleryImages(images);

        openGallery(index);
    };

    const getGallerySubtitle = useCallback(
        (index: number) => {
            return `${type === "before" ? "Before" : "After"} Photo ${index + 1} of ${
                photos.length
            }`;
        },
        [type, photos.length],
    );

    const checkFileSize = async (uri: string): Promise<boolean> => {
        try {
            const file = new File(uri);
            const size = file.size ?? 0;
            return file.exists && size <= MAX_FILE_SIZE;
        } catch (error) {
            console.error("Error checking file size:", error);
            return false;
        }
    };

    const handlePhotoSelected = async (
        result: ImagePicker.ImagePickerResult,
    ) => {
        if (
            result.canceled ||
            !result.assets?.length ||
            isUploading ||
            !scheduleId ||
            !system?.attachmentQueue
        ) {
            return;
        }

        try {
            setIsUploading(true);
            const queue = system.attachmentQueue;
            setShowModal(false);

            const validationResults = await Promise.all(
                result.assets.map(async (asset) => {
                    const isValidSize = await checkFileSize(asset.uri);
                    return { asset, isValidSize };
                }),
            );

            const validAssets = validationResults
                .filter((r) => r.isValidSize)
                .map((r) => r.asset);
            const invalidAssets = validationResults
                .filter((r) => !r.isValidSize)
                .map((r) => r.asset);

            if (invalidAssets.length > 0) {
                Alert.alert(
                    "Files Too Large",
                    `${invalidAssets.length} photo${
                        invalidAssets.length > 1 ? "s" : ""
                    } exceeds the 20MB size limit and will be skipped.`,
                    [{ text: "OK" }],
                );
            }

            if (validAssets.length === 0) {
                showToast(
                    "No photos were added - all files exceeded the 20MB size limit",
                );
                return;
            }

            const photoData = validAssets.map((asset) => ({
                sourceUri: asset.uri,
                scheduleId: scheduleId,
                type: type,
                technicianId: technicianId,
                jobTitle: jobTitle,
                startDate: startDate,
            }));

            const savedIds = await queue.queuePhotos(photoData);

            showToast(
                `Added ${savedIds.length} ${type} photo${
                    savedIds.length > 1 ? "s" : ""
                } - uploading in background`,
            );
        } catch (error) {
            Alert.alert(
                "Error",
                error instanceof Error
                    ? error.message
                    : "Failed to save photos. Please try again.",
            );
        } finally {
            setIsUploading(false);
        }
    };

    const handleCameraPhotosConfirmed = async (photoUris: string[]) => {
        setShowCameraModal(false);
        if (photoUris.length === 0) return;

        try {
            const assets = await Promise.all(
                photoUris.map(async (uri) => {
                    const file = new File(uri);
                    const context = ImageManipulator.manipulate(uri);
                    const image = await context.renderAsync();

                    const width = image.width;
                    const height = image.height;
                    image.release();
                    context.release();

                    return {
                        uri,
                        width,
                        height,
                        fileSize: file.size ?? 0,
                        assetId: null,
                        fileName: uri.split("/").pop() || "photo.jpg",
                        type: "image" as const,
                        exif: null,
                        base64: null,
                        duration: null,
                        mimeType: "image/jpeg",
                    } as ImagePicker.ImagePickerAsset;
                }),
            );

            const cameraResult: ImagePicker.ImagePickerResult = {
                canceled: false,
                assets,
            };

            await handlePhotoSelected(cameraResult);
        } catch (error) {
            console.error("Error processing camera photos:", error);
            Alert.alert("Error", "Failed to process photos. Please try again.");
        }
    };

    const handleDeleteConfirm = async () => {
        if (!photoToDelete || !scheduleId || !powerSync || isDeleting) return;

        try {
            setIsDeleting(true);
            const photoId = photoToDelete.id;

            await powerSync.writeTransaction(async (tx) => {
                await tx.execute(`DELETE FROM photos WHERE id = ?`, [photoId]);

                if (system?.attachmentQueue) {
                    const attachments = await tx.getAll<AttachmentRecord>(
                        `SELECT * FROM attachments WHERE id = ?`,
                        [photoId],
                    );

                    if (attachments.length > 0) {
                        await system.attachmentQueue.delete(attachments[0], tx);
                    }
                }
            });

            showToast("Photo deleted successfully");
            setPhotoToDelete(null);
        } catch (error) {
            Alert.alert("Error", "Failed to delete photo. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteRequest = (photoId: string) => {
        setShowModal(false);
        setGalleryVisible(false);
        setPhotoToDelete({ id: photoId });
    };

    const openGallery = (photoIndex: number = 0) => {
        if (photos.length === 0) return;

        setGalleryIndex(photoIndex);
        setGalleryVisible(true);
    };

    const isLoading = externalLoading || isUploading || isQueryLoading;

    return (
        <View className="flex-1 mb-6">
            <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                    <View
                        className={`px-2 py-1 rounded-xl ${
                            type === "before" ? "bg-blue-100" : "bg-green-100"
                        }`}
                    >
                        <Text
                            className={`text-xs font-semibold ${
                                type === "before"
                                    ? "text-blue-800"
                                    : "text-green-800"
                            }`}
                        >
                            {type === "before" ? "Before" : "After"}
                        </Text>
                    </View>

                    <Text className="ml-1 text-base font-semibold">
                        {photos.length > 0 && `(${photos.length})`}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => {
                        setPhotoToDelete(null);
                        setGalleryVisible(false);
                        setShowModal(true);
                    }}
                    className={`px-4 py-2 rounded-lg ${
                        type === "before" ? "bg-blue-500" : "bg-green-500"
                    }`}
                    disabled={isLoading}
                >
                    <Text className="text-white font-semibold text-sm">
                        {isLoading ? "Processing..." : "Add Photos"}
                    </Text>
                </TouchableOpacity>
            </View>

            <PhotoGrid
                photos={photos}
                onDeletePhoto={handleDeleteRequest}
                onPhotoPress={handlePhotoPress}
            />

            {showModal && (
                <PhotoCaptureModal
                    visible={showModal}
                    onClose={() => {
                        setShowModal(false);
                    }}
                    onPhotoSelected={handlePhotoSelected}
                    onOpenCamera={() => setShowCameraModal(true)}
                />
            )}

            {showCameraModal && (
                <CameraCaptureModal
                    visible={showCameraModal}
                    onClose={() => setShowCameraModal(false)}
                    onPhotosConfirmed={handleCameraPhotosConfirmed}
                    type={type}
                />
            )}

            {photoToDelete !== null && (
                <DeletePhotoModal
                    visible={!!photoToDelete}
                    onClose={() => setPhotoToDelete(null)}
                    onConfirm={handleDeleteConfirm}
                    isDeleting={isDeleting}
                />
            )}

            {galleryVisible && (
                <FastImageViewer
                    images={galleryImages}
                    imageIndex={galleryIndex}
                    visible={galleryVisible}
                    onRequestClose={() => setGalleryVisible(false)}
                    swipeToCloseEnabled={true}
                    doubleTapToZoomEnabled={true}
                    title={jobTitle}
                    getSubtitle={getGallerySubtitle}
                />
            )}

            {isLoading && <LoadingModal visible={isLoading} type={type} />}
        </View>
    );
}
