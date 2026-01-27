import { useState, useMemo } from "react";
import { View, Text } from "react-native";
import { PhotoType } from "@/utils/photos";
import { PhotoItem } from "./PhotoItem";

interface PhotoGridProps {
    photos: ReadonlyArray<PhotoType>;
    onDeletePhoto: (photoId: string) => void;
    onPhotoPress?: (photoIndex: number) => void;
}

export function PhotoGrid({
    photos,
    onDeletePhoto,
    onPhotoPress,
}: PhotoGridProps) {
    const [deletingPhotoIds, setDeletingPhotoIds] = useState<string[]>([]);

    const handleDelete = (photoId: string) => {
        if (deletingPhotoIds.includes(photoId)) return;

        setDeletingPhotoIds((prev) => [...prev, photoId]);
        onDeletePhoto(photoId);

        setTimeout(() => {
            setDeletingPhotoIds((prev) => prev.filter((id) => id !== photoId));
        }, 5000);
    };

    const EmptyState = useMemo(
        () => (
            <View className="h-[150px] bg-gray-50 rounded-xl justify-center items-center border border-gray-200 border-dashed my-2">
                <Text className="text-base font-medium text-gray-400 mb-1">
                    No photos yet
                </Text>
                <Text className="text-xs text-gray-400">
                    Tap "Add Photos" to get started
                </Text>
            </View>
        ),
        [],
    );

    if (photos.length === 0) {
        return EmptyState;
    }

    return (
        <View className="flex-row flex-wrap my-2">
            {photos.map((photo, index) => (
                <PhotoItem
                    key={photo.id}
                    photo={photo}
                    index={index}
                    onPhotoPress={onPhotoPress}
                    onDelete={handleDelete}
                    isDeleting={deletingPhotoIds.includes(photo.id)}
                />
            ))}
        </View>
    );
}
