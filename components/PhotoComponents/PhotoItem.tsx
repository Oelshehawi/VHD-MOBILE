import { TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import { PhotoType } from '@/utils/photos';
import { useState, useEffect } from 'react';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';
import { useSystem } from '@/services/database/System';
import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';
import { buildCloudinaryUrlMobile } from '@/utils/cloudinaryUrl.native';

// Cloudinary configuration
const CLOUD_NAME = 'dhu4yrn5k';
const THUMBNAIL_WIDTH = 240; // Grid thumbnails are ~1/3 screen width

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
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const system = useSystem();

  // Enhanced detection of pending photos
  const isPending = photo.status === 'pending';

  // Resolve the image URL - for pending photos we need the local file path
  useEffect(() => {
    const resolveUrl = async () => {
      if (isPending && system?.attachmentQueue) {
        try {
          // If this is a pending photo, use local_uri which we can use directly
          if (photo.local_uri) {
            const localUri = system.attachmentQueue.getLocalUri(
              photo.local_uri
            );
            setResolvedUrl(localUri);

            // Verify the file exists
            const fileInfo = await FileSystem.getInfoAsync(localUri);
            if (!fileInfo.exists) {
              setImageError(true);
            }
            return;
          }

          // Fallback if no local_uri - try direct attachments folder access
          if (photo.url) {
            const filename = photo.url.split('/').pop() || photo.url;
            const directPath = `${FileSystem.documentDirectory}attachments/${filename}`;

            // Check if file exists
            const fileInfo = await FileSystem.getInfoAsync(directPath);
            if (fileInfo.exists) {
              setResolvedUrl(directPath);
              return;
            }

            // Final fallback - use the URL as is
            setResolvedUrl(photo.url);
          } else {
            setImageError(true);
          }
        } catch (error) {
          setImageError(true);
        }
      } else {
        // For uploaded photos, transform to thumbnail size for bandwidth optimization
        const transformedUrl = buildCloudinaryUrlMobile({
          urlOrPublicId: photo.url,
          cloudName: CLOUD_NAME,
          width: THUMBNAIL_WIDTH,
        });
        setResolvedUrl(transformedUrl);
      }
    };

    resolveUrl();
  }, [
    photo.url,
    photo.local_uri,
    photo.attachmentId,
    isPending,
    system?.attachmentQueue,
  ]);

  return (
    <View className='w-1/3 aspect-square p-1'>
      <TouchableOpacity
        onPress={() => onPhotoPress?.(index)}
        className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative shadow-sm'
        activeOpacity={0.8}
        disabled={isDeleting || isPending}
      >
        {/* If there's an error or no URL, show placeholder */}
        {imageError || !resolvedUrl ? (
          <View className='w-full h-full bg-gray-200 items-center justify-center'>
            <Text className='text-gray-500 font-medium'>Image</Text>
          </View>
        ) : // For local file URLs, use regular Image instead of FastImageWrapper
        resolvedUrl.startsWith('file:') ? (
          <Image
            source={{ uri: resolvedUrl }}
            style={{ width: '100%', height: '100%' }}
            onError={() => setImageError(true)}
            resizeMode='cover'
          />
        ) : (
          <FastImageWrapper
            uri={resolvedUrl}
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
              <ActivityIndicator size='small' color='#ffffff' />
              <Text className='text-white text-xs font-bold mt-2 px-2 text-center'>
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
