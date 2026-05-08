import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PhotoType } from '@/utils/photos';
import { PhotoItem } from './PhotoItem';

interface PhotoGridProps {
  photos: ReadonlyArray<PhotoType>;
  onDeletePhoto: (photoId: string) => void;
  onPhotoPress?: (photoIndex: number) => void;
}

export function PhotoGrid({ photos, onDeletePhoto, onPhotoPress }: PhotoGridProps) {
  const deletingPhotoIdsRef = useRef<Set<string>>(new Set());
  const deleteTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const deleteTimeouts = deleteTimeoutsRef.current;
    return () => {
      deleteTimeouts.forEach((timeout) => clearTimeout(timeout));
      deleteTimeouts.clear();
    };
  }, []);

  const handleDelete = useCallback(
    (photoId: string) => {
      if (deletingPhotoIdsRef.current.has(photoId)) return;

      const nextDeleting = new Set(deletingPhotoIdsRef.current);
      nextDeleting.add(photoId);
      deletingPhotoIdsRef.current = nextDeleting;
      setDeletingPhotoIds(nextDeleting);
      onDeletePhoto(photoId);

      const timeout = setTimeout(() => {
        const next = new Set(deletingPhotoIdsRef.current);
        next.delete(photoId);
        deletingPhotoIdsRef.current = next;
        deleteTimeoutsRef.current.delete(photoId);
        setDeletingPhotoIds(next);
      }, 5000);
      deleteTimeoutsRef.current.set(photoId, timeout);
    },
    [onDeletePhoto]
  );

  const EmptyState = useMemo(
    () => (
      <View className='my-2 h-[150px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 dark:border-white/15 dark:bg-[#16140F]'>
        <View className='mb-3 h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm dark:bg-[#2A261D]'>
          <Ionicons name='images-outline' size={22} color='#8A857D' />
        </View>
        <Text className='mb-1 text-base font-semibold text-gray-700 dark:text-[#F2EFEA]'>
          No photos yet
        </Text>
        <Text className='text-center text-xs font-medium text-gray-500 dark:text-[#C9C3BA]'>
          Tap Add Photos to get started
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
          key={photo.id}
          photo={photo}
          index={index}
          onPhotoPress={onPhotoPress}
          onDelete={handleDelete}
          isDeleting={deletingPhotoIds.has(photo.id)}
        />
      ))}
    </View>
  );
}
