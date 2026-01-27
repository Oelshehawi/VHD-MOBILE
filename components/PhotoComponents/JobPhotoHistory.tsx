import React, { useState, useCallback, useMemo } from "react";
import {
    View,
    Text,
    Pressable,
    ActivityIndicator,
    useWindowDimensions,
} from "react-native";
import { format } from "date-fns";
import { useQuery, DEFAULT_ROW_COMPARATOR } from "@powersync/react-native";
import { PhotoType } from "@/utils/photos";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FastImageWrapper } from "@/components/common/FastImageWrapper";
import { FastImageViewer } from "@/components/common/FastImageViewer";
import { preloadImages } from "@/utils/imageCache";
import { buildCloudinaryUrlMobile } from "@/utils/cloudinaryUrl.native";
import { AppConfig } from "@/services/database/AppConfig";

const CLOUD_NAME = AppConfig.cloudinaryCloudName || "";
const THUMBNAIL_WIDTH = 240;

interface GalleryImage {
    uri: string;
    title?: string;
    type?: "before" | "after" | "signature" | "estimate";
}

interface JobSection {
    id: string;
    title: string;
    date: string;
    beforePhotos: PhotoType[];
    afterPhotos: PhotoType[];
    signaturePhotos: PhotoType[];
}

interface JobPhotoHistoryProps {
    scheduleId: string;
    jobTitle: string;
}

interface HistoryRow {
    scheduleId: string;
    jobTitle: string;
    startDateTime: string | null;
    photoId: string | null;
    cloudinaryUrl: string | null;
    type: PhotoType["type"] | null;
    timestamp: string | null;
    signerName: string | null;
    technicianId: string | null;
}

export function JobPhotoHistory({
    scheduleId,
    jobTitle,
}: JobPhotoHistoryProps) {
    const { width } = useWindowDimensions();

    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [galleryJobDate, setGalleryJobDate] = useState("");

    const thumbnailSize = useMemo(() => Math.floor((width - 64) / 3), [width]);

    const { data: historyRows = [], isLoading: isHistoryLoading } =
        useQuery<HistoryRow>(
            jobTitle && scheduleId
                ? `SELECT s.id as scheduleId, s.jobTitle, s.startDateTime,
             p.id as photoId, p.cloudinaryUrl, p.type, p.timestamp, p.signerName, p.technicianId
           FROM schedules s
           LEFT JOIN photos p
             ON p.scheduleId = s.id AND p.cloudinaryUrl IS NOT NULL
           WHERE s.jobTitle = ? AND s.id != ?
           ORDER BY s.startDateTime DESC, p.timestamp ASC`
                : `SELECT s.id as scheduleId FROM schedules s WHERE 0`,
            [jobTitle?.trim(), scheduleId],
            { rowComparator: DEFAULT_ROW_COMPARATOR },
        );

    const { data: estimatePhotos = [], isLoading: isEstimateLoading } =
        useQuery<PhotoType>(
            scheduleId
                ? `SELECT id, scheduleId, cloudinaryUrl, type, timestamp, technicianId, signerName
           FROM photos
           WHERE scheduleId = ? AND type = 'estimate' AND cloudinaryUrl IS NOT NULL
           ORDER BY timestamp ASC`
                : `SELECT id FROM photos WHERE 0`,
            [scheduleId],
            { rowComparator: DEFAULT_ROW_COMPARATOR },
        );

    const jobSections = useMemo(() => {
        if (!historyRows.length) return [];

        const sections = new Map<string, JobSection>();
        const photoUrls: string[] = [];

        for (const row of historyRows) {
            if (!row.scheduleId) continue;

            if (!sections.has(row.scheduleId)) {
                sections.set(row.scheduleId, {
                    id: row.scheduleId,
                    title: row.jobTitle || "Untitled Job",
                    date: row.startDateTime
                        ? format(new Date(row.startDateTime), "MMM d, yyyy")
                        : "Unknown Date",
                    beforePhotos: [],
                    afterPhotos: [],
                    signaturePhotos: [],
                });
            }

            if (!row.photoId || !row.cloudinaryUrl || !row.type) continue;

            const cloudinaryUrl = row.cloudinaryUrl;
            const section = sections.get(row.scheduleId);
            if (!section) continue;

            const photo: PhotoType = {
                id: row.photoId,
                scheduleId: row.scheduleId,
                cloudinaryUrl,
                type: row.type,
                timestamp: row.timestamp || new Date().toISOString(),
                technicianId: row.technicianId || "",
                signerName: row.signerName ?? null,
            };

            if (photo.type === "before") section.beforePhotos.push(photo);
            if (photo.type === "after") section.afterPhotos.push(photo);
            if (photo.type === "signature") section.signaturePhotos.push(photo);

            photoUrls.push(
                buildCloudinaryUrlMobile({
                    urlOrPublicId: cloudinaryUrl,
                    cloudName: CLOUD_NAME,
                    width: 720,
                }),
            );
        }

        const sectionList = Array.from(sections.values()).filter(
            (section) =>
                section.beforePhotos.length ||
                section.afterPhotos.length ||
                section.signaturePhotos.length,
        );

        if (photoUrls.length > 0) {
            preloadImages(photoUrls.slice(0, 20));
        }

        return sectionList;
    }, [historyRows]);

    const openGallery = useCallback(
        (
            jobSection: JobSection,
            photoType: "before" | "after" | "signature",
            photoIndex: number = 0,
        ) => {
            const photos =
                photoType === "before"
                    ? jobSection.beforePhotos
                    : photoType === "after"
                      ? jobSection.afterPhotos
                      : jobSection.signaturePhotos;

            if (!photos.length) return;

            const allImages: GalleryImage[] = [
                ...jobSection.beforePhotos.map((p) => ({
                    uri: p.cloudinaryUrl || "",
                    title: "Before Photo",
                    type: "before" as const,
                })),
                ...jobSection.afterPhotos.map((p) => ({
                    uri: p.cloudinaryUrl || "",
                    title: "After Photo",
                    type: "after" as const,
                })),
                ...jobSection.signaturePhotos.map((p) => ({
                    uri: p.cloudinaryUrl || "",
                    title: `Signature: ${p.signerName || "Unknown"}`,
                    type: "signature" as const,
                })),
            ].filter((image) => image.uri);

            if (allImages.length === 0) return;

            let startIndex = 0;
            if (photoType === "after") {
                startIndex = jobSection.beforePhotos.length;
            } else if (photoType === "signature") {
                startIndex =
                    jobSection.beforePhotos.length +
                    jobSection.afterPhotos.length;
            }

            setGalleryImages(allImages);
            setGalleryIndex(
                Math.min(startIndex + photoIndex, allImages.length - 1),
            );
            setGalleryJobDate(jobSection.date);
            setGalleryVisible(true);
        },
        [],
    );

    const getGallerySubtitle = useCallback(
        (index: number, image: GalleryImage) => {
            return `${galleryJobDate} - ${
                image?.type === "before"
                    ? "Before Photo"
                    : image?.type === "after"
                      ? "After Photo"
                      : "Signature"
            }`;
        },
        [galleryJobDate],
    );

    const renderPhotoItem = useCallback(
        (
            photo: PhotoType,
            jobSection: JobSection,
            photoType: "before" | "after" | "signature",
            photoIndex: number,
        ) => {
            const styles = {
                before: { bg: "bg-blue-500/80", label: "Before" },
                after: { bg: "bg-green-500/80", label: "After" },
                signature: { bg: "bg-purple-500/80", label: "Signature" },
            };

            const style = styles[photoType];

            const thumbnailUrl = buildCloudinaryUrlMobile({
                urlOrPublicId: photo.cloudinaryUrl || "",
                cloudName: CLOUD_NAME,
                width: THUMBNAIL_WIDTH,
            });

            return (
                <Pressable
                    key={
                        photo.id ||
                        `${jobSection.id}-${photoType}-${photoIndex}`
                    }
                    onPress={() =>
                        openGallery(jobSection, photoType, photoIndex)
                    }
                    style={{
                        width: thumbnailSize,
                        height: thumbnailSize,
                        marginRight: 8,
                        marginBottom: 8,
                    }}
                    className="rounded-lg overflow-hidden"
                >
                    <FastImageWrapper
                        uri={thumbnailUrl}
                        style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 8,
                        }}
                        showLoader={true}
                    />
                    <View
                        className={`absolute bottom-0 left-0 right-0 py-1 items-center ${style.bg}`}
                    >
                        <Text className="text-white text-xs font-medium">
                            {style.label}
                        </Text>
                    </View>
                </Pressable>
            );
        },
        [thumbnailSize, openGallery],
    );

    const renderPhotoSection = useCallback(
        (
            photos: PhotoType[],
            jobSection: JobSection,
            photoType: "before" | "after" | "signature",
        ) => {
            if (!photos.length) return null;

            const sectionConfig = {
                before: {
                    icon: "camera-outline",
                    color: "#3b82f6",
                    title: "Before Photos",
                },
                after: {
                    icon: "checkmark-circle-outline",
                    color: "#10b981",
                    title: "After Photos",
                },
                signature: {
                    icon: "pencil-outline",
                    color: "#8b5cf6",
                    title: "Signatures",
                },
            };

            const config = sectionConfig[photoType];

            return (
                <View className="mb-4">
                    <Text className="text-sm font-medium mb-2 text-gray-600">
                        <Ionicons
                            name={config.icon as any}
                            size={16}
                            color={config.color}
                        />{" "}
                        {config.title}
                    </Text>
                    <View className="flex-row flex-wrap">
                        {photos.map((photo, index) =>
                            renderPhotoItem(
                                photo,
                                jobSection,
                                photoType,
                                index,
                            ),
                        )}
                    </View>
                </View>
            );
        },
        [renderPhotoItem],
    );

    const renderJobCard = useCallback(
        (jobSection: JobSection) => {
            return (
                <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100">
                    <View className="flex-row items-center mb-3">
                        <View className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2.5" />
                        <Text className="text-base font-semibold text-gray-800">
                            {jobSection.date}
                        </Text>
                    </View>

                    {renderPhotoSection(
                        jobSection.beforePhotos,
                        jobSection,
                        "before",
                    )}
                    {renderPhotoSection(
                        jobSection.afterPhotos,
                        jobSection,
                        "after",
                    )}
                    {renderPhotoSection(
                        jobSection.signaturePhotos,
                        jobSection,
                        "signature",
                    )}
                </View>
            );
        },
        [renderPhotoSection],
    );

    if (isHistoryLoading || isEstimateLoading) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#0891b2" />
                <Text className="mt-3 text-gray-500 text-base">
                    Loading previous jobs...
                </Text>
            </View>
        );
    }

    if (jobSections.length === 0 && estimatePhotos.length > 0) {
        return (
            <View className="flex-1 p-2">
                <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <View className="flex-row items-center mb-1">
                        <Ionicons
                            name="information-circle"
                            size={18}
                            color="#d97706"
                        />
                        <Text className="text-amber-800 font-semibold ml-2">
                            First Time Job
                        </Text>
                    </View>
                    <Text className="text-amber-700 text-sm">
                        No previous job history. Showing reference photos from
                        the estimate.
                    </Text>
                </View>

                <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <View className="flex-row items-center mb-3">
                        <Ionicons
                            name="images-outline"
                            size={20}
                            color="#8b5cf6"
                        />
                        <Text className="text-base font-semibold text-gray-800 ml-2">
                            Estimate Reference Photos ({estimatePhotos.length})
                        </Text>
                    </View>

                    <View className="flex-row flex-wrap">
                        {estimatePhotos.map((photo, index) => {
                            const thumbnailUrl = buildCloudinaryUrlMobile({
                                urlOrPublicId: photo.cloudinaryUrl || "",
                                cloudName: CLOUD_NAME,
                                width: THUMBNAIL_WIDTH,
                            });

                            return (
                                <Pressable
                                    key={photo.id || `estimate-${index}`}
                                    onPress={() => {
                                        const images = estimatePhotos
                                            .map((p) => ({
                                                uri: p.cloudinaryUrl || "",
                                                title: "Estimate Photo",
                                                type: "estimate" as const,
                                            }))
                                            .filter((image) => image.uri);
                                        setGalleryImages(images);
                                        setGalleryIndex(index);
                                        setGalleryJobDate("Estimate");
                                        setGalleryVisible(true);
                                    }}
                                    style={{
                                        width: thumbnailSize,
                                        height: thumbnailSize,
                                        marginRight: 8,
                                        marginBottom: 8,
                                    }}
                                    className="rounded-lg overflow-hidden"
                                >
                                    <FastImageWrapper
                                        uri={thumbnailUrl}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            borderRadius: 8,
                                        }}
                                        showLoader={true}
                                    />
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

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
            </View>
        );
    }

    if (jobSections.length === 0) {
        return (
            <View className="flex-1 items-center justify-center py-8">
                <Ionicons name="image-outline" size={48} color="#9ca3af" />
                <Text className="text-gray-500 mt-2">
                    No previous job photos found
                </Text>
            </View>
        );
    }

    return (
        <View className="flex-1">
            {jobSections.map((jobSection) => (
                <View key={jobSection.id}>{renderJobCard(jobSection)}</View>
            ))}

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
        </View>
    );
}
