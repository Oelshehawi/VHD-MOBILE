import { useState, useMemo } from 'react';
import {
  View,
  Text,
} from 'react-native';
import { PhotoType } from '@/utils/photos';
import { PhotoItem } from './PhotoItem';



interface PhotoGridProps {
  photos: PhotoType[];
  onDeletePhoto: (photoId: string, url: string, attachmentId?: string) => void;
  onPhotoPress?: (photoIndex: number) => void;
  currentScheduleId?: string;
}


export function PhotoGrid({
  photos,
  onDeletePhoto,
  onPhotoPress,
}: PhotoGridProps) {
  // For tracking photos currently being deleted
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<string[]>([]);

  // Enhanced delete handler with visual feedback
  const handleDelete = (
    photoId: string,
    url: string,
    attachmentId?: string
  ) => {
    setDeletingPhotoIds((prev) => [...prev, photoId]);

    // Call the parent component's delete handler
    onDeletePhoto(photoId, url, attachmentId);

    // Remove from deletingPhotoIds after a short delay
    setTimeout(() => {
      setDeletingPhotoIds((prev) => prev.filter((id) => id !== photoId));
    }, 5000);
  };

  // Memoize the empty state to prevent rerenders
  const EmptyState = useMemo(
    () => (
      <View className='h-[150px] bg-gray-50 rounded-xl justify-center items-center border border-gray-200 border-dashed my-2'>
        <Text className='text-base font-medium text-gray-400 mb-1'>
          No photos yet
        </Text>
        <Text className='text-xs text-gray-400'>
          Tap "Add Photos" to get started
        </Text>
      </View>
    ),
    []
  );

  if (photos.length === 0) {
    return EmptyState;
  }

  return (
    <View className='flex-row flex-wrap my-2'>
      {photos.map((photo, index) => (
        <PhotoItem
          key={photo._id as string}
          photo={photo}
          index={index}
          onPhotoPress={onPhotoPress}
          onDelete={handleDelete}
          isDeleting={deletingPhotoIds.includes(photo._id as string)}
        />
      ))}
    </View>
  );
}
