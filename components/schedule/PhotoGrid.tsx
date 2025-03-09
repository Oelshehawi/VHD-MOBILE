import React from 'react';
import { View, Image, TouchableOpacity, Text } from 'react-native';
import { PhotoType } from '@/types';

interface PhotoGridProps {
  photos: PhotoType[];
  pendingPhotos?: PhotoType[];
  onDeletePhoto: (photoId: string, url: string) => void;
  onPhotoPress?: (photoIndex: number) => void;
}

export function PhotoGrid({
  photos,
  pendingPhotos = [],
  onDeletePhoto,
  onPhotoPress,
}: PhotoGridProps) {
  // Remove duplicate photos by id and url
  const uniquePhotos = photos.reduce((acc: PhotoType[], photo) => {
    const isDuplicate = acc.some(
      (p) =>
        (p.id && photo.id && p.id === photo.id) ||
        (p._id && photo._id && p._id === photo._id) ||
        (p.url && photo.url && p.url === photo.url)
    );
    if (!isDuplicate) {
      acc.push(photo);
    }
    return acc;
  }, []);

  // Filter out pending photos to avoid duplicates
  const uploadedPhotos = uniquePhotos.filter(
    (photo) =>
      photo.status === 'uploaded' &&
      (photo.id || photo._id) &&
      !pendingPhotos.some(
        (p) =>
          (p.id && photo.id && p.id === photo.id) ||
          (p._id && photo._id && p._id === photo._id)
      )
  );

  // Handle photo press
  const handlePhotoPress = (photoIndex: number) => {
    if (onPhotoPress) {
      onPhotoPress(photoIndex);
    }
  };

  return (
    <View className='flex-row flex-wrap gap-3'>
      {/* Pending Photos */}
      {pendingPhotos
        .filter((p) => p.id || p._id)
        .map((photo) => (
          <View key={`pending-${photo.id || photo._id}`} className='relative'>
            <Image
              source={{ uri: photo.url }}
              className='w-28 h-28 rounded-lg opacity-70'
            />
            <View className='absolute top-1 right-1 bg-yellow-500 rounded-full px-2 py-1'>
              <Text className='text-white text-xs'>Pending</Text>
            </View>
          </View>
        ))}

      {/* Uploaded Photos */}
      {uploadedPhotos
        .filter((p) => p.id || p._id)
        .map((photo, index) => (
          <View key={`uploaded-${photo.id || photo._id}`} className='relative'>
            <TouchableOpacity
              onPress={() => handlePhotoPress(index)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: photo.url }}
                className='w-28 h-28 rounded-lg'
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                (photo.id || photo._id) &&
                onDeletePhoto(photo.id || photo._id!, photo.url)
              }
              className='absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center'
            >
              <Text className='text-white text-sm'>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
    </View>
  );
}
