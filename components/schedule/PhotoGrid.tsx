import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { PhotoType } from '@/utils/photos';

// Extended PhotoType to handle MongoDB-style documents
interface MongoPhotoType extends PhotoType {
  _id?: string | { $oid: string };
  scheduleId?: string;
}

interface PhotoGridProps {
  photos: MongoPhotoType[];
  onDeletePhoto: (photoId: string, url: string) => void;
  onPhotoPress?: (photoIndex: number) => void;
  currentScheduleId?: string;
}

export function PhotoGrid({
  photos,
  onDeletePhoto,
  onPhotoPress,
  currentScheduleId,
}: PhotoGridProps) {
  // For tracking photos currently being deleted
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<string[]>([]);


  // Enhanced delete handler with visual feedback
  const handleDelete = (photoId: string, url: string) => {
    const reliableId = getReliablePhotoId({
      _id: photoId,
      url,
    } as MongoPhotoType);
    setDeletingPhotoIds((prev) => [...prev, reliableId]);

    // Call the parent component's delete handler
    onDeletePhoto(photoId, url);

    // Remove from deletingPhotoIds after a short delay (simulate completion)
    setTimeout(() => {
      setDeletingPhotoIds((prev) => prev.filter((id) => id !== reliableId));
    }, 5000);
  };

  if (photos.length === 0) {
    return (
      <View className='h-[150px] bg-gray-50 rounded-xl justify-center items-center border border-gray-200 border-dashed my-2'>
        <Text className='text-base font-medium text-gray-400 mb-1'>
          No photos yet
        </Text>
        <Text className='text-xs text-gray-400'>
          Tap "Add Photos" to get started
        </Text>
      </View>
    );
  }

  // Function to extract a reliable ID from the photo
  const getReliablePhotoId = (photo: MongoPhotoType): string => {
    // First try MongoDB ObjectId format
    if (photo._id) {
      if (typeof photo._id === 'object' && '$oid' in photo._id) {
        return photo._id.$oid;
      } else if (typeof photo._id === 'string') {
        return photo._id;
      }
    }

    // Fall back to regular id
    if (photo.id) {
      return photo.id;
    }

    // If no ID found, generate a fallback ID from the URL
    if (photo.url) {
      const urlParts = photo.url.split('/');
      return `fallback_${urlParts[urlParts.length - 1].split('.')[0]}`;
    }

    // Last resort: timestamp-based ID
    return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  return (
    <View className='flex-row flex-wrap my-2'>
      {photos.map((photo, index) => (
        <View
          key={getReliablePhotoId(photo) || index}
          className='w-1/3 aspect-square p-1'
        >
          <TouchableOpacity
            onPress={() => onPhotoPress?.(index)}
            className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative shadow-sm'
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: photo.url }}
              className='w-full h-full'
              resizeMode='cover'
            />

            {/* Status indicator - Moved to center of image and made larger */}
            {photo.status === 'pending' && (
              <View className='absolute inset-0 flex items-center justify-center bg-black/20'>
                <ActivityIndicator size='large' color='#ffffff' />
              </View>
            )}

            {/* Failed upload indicator */}
            {photo.status === 'failed' && (
              <View className='absolute top-2 right-2 w-5 h-5 rounded-full justify-center items-center bg-red-500'>
                <Text className='text-white text-xs font-bold'>!</Text>
              </View>
            )}

            {/* Photo timestamp indicator */}
            <View className='absolute bottom-0 left-0 right-0 bg-black/40 py-1'>
              <Text className='text-white text-[10px] text-center font-medium'>
                {new Date(photo.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            {/* Delete button */}
            <TouchableOpacity
              onPress={() => {
                // Get reliable photo ID
                const photoId = getReliablePhotoId(photo);

                // Call the delete handler with ID and URL
                handleDelete(photoId, photo.url || '');
              }}
              className='absolute top-2 right-2 bg-red-500 w-[22px] h-[22px] rounded-full items-center justify-center opacity-90'
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text className='text-white text-xs font-bold leading-[18px]'>
                ✕
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
