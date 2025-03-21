import { TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import { PhotoType } from '@/utils/photos';
import { useState } from 'react';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';

/**
 * Individual photo item component
 */
interface PhotoItemProps {
  photo: PhotoType;
  index: number;
  onPhotoPress?: (index: number) => void;
  onDelete: (id: string, url: string, attachmentId?: string) => void;
  isDeleting: boolean;
}

export function PhotoItem({
  photo,
  index,
  onPhotoPress,
  onDelete,
  isDeleting,
}: PhotoItemProps) {
  const photoId = photo._id;
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Enhanced detection of local/pending photos
  const isLocalUrl =
    photo.url?.startsWith('local://') ||
    photo.url?.startsWith('file://') ||
    photo.url?.startsWith('content://');

  const isPending =
    photo.status === 'pending' ||
    isLocalUrl ||
    !photo.url?.includes('cloudinary');

  const isFailed = photo.status === 'failed' || imageError;

  return (
    <View className='w-1/3 aspect-square p-1'>
      <TouchableOpacity
        onPress={() => onPhotoPress?.(index)}
        className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative shadow-sm'
        activeOpacity={0.8}
        disabled={isDeleting || isPending}
      >
        {/* If there's an error or no URL, show placeholder */}
        {imageError || !photo.url ? (
          <View className='w-full h-full bg-gray-200 items-center justify-center'>
            <Text className='text-gray-500 font-medium'>Image</Text>
          </View>
        ) : (
          <FastImageWrapper
            uri={photo.url}
            style={{ width: '100%', height: '100%' }}
            showLoader={true}
            onError={() => setImageError(true)}
            onLoad={() => setImageLoaded(true)}
          />
        )}

        {/* Status indicator - enhanced for more visibility */}
        {isPending && (
          <View className='absolute inset-0 flex items-center justify-center bg-black/40'>
            <View className='bg-black/70 p-3 rounded-lg items-center'>
              <ActivityIndicator size='large' color='#ffffff' />
              <Text className='text-white text-sm font-bold mt-2 px-2 text-center'>
                Uploading...
              </Text>
            </View>
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
          onPress={() =>
            onDelete(photoId as string, photo.url || '', photo.attachmentId)
          }
          className={`absolute top-2 right-2 ${
            isPending ? 'bg-gray-400' : 'bg-red-500'
          } w-[22px] h-[22px] rounded-full items-center justify-center opacity-90`}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          disabled={isDeleting || isPending}
        >
          <Text className='text-white text-xs font-bold leading-[18px]'>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}
