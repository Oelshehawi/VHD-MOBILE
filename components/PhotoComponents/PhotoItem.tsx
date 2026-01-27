import { TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import { PhotoType } from '@/utils/photos';
import { useState, useEffect } from 'react';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';
import { useSystem } from '@/services/database/System';
import { File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { buildCloudinaryUrlMobile } from '@/utils/cloudinaryUrl.native';
import { AppConfig } from '@/services/database/AppConfig';

const CLOUD_NAME = AppConfig.cloudinaryCloudName || '';
const THUMBNAIL_WIDTH = 240;

interface PhotoItemProps {
  photo: PhotoType;
  index: number;
  onPhotoPress?: (index: number) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export function PhotoItem({
  photo,
  index,
  onPhotoPress,
  onDelete,
  isDeleting,
}: PhotoItemProps) {
  const [imageError, setImageError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const system = useSystem();

  const isLoading = photo.cloudinaryUrl === null;

  useEffect(() => {
    const resolveUrl = async () => {
      setImageError(false);

      if (isLoading && system?.attachmentQueue) {
        if (photo.local_uri) {
          const localUri = system.attachmentQueue.getLocalUri(photo.local_uri);
          setResolvedUrl(localUri);
          return;
        }

        if (photo.filename) {
          const directPath = new File(
            Paths.document,
            'attachments',
            photo.filename
          ).uri;
          setResolvedUrl(directPath);
          return;
        }

        setResolvedUrl('');
        return;
      }

      if (photo.cloudinaryUrl) {
        const transformedUrl = buildCloudinaryUrlMobile({
          urlOrPublicId: photo.cloudinaryUrl,
          cloudName: CLOUD_NAME,
          width: THUMBNAIL_WIDTH,
        });
        setResolvedUrl(transformedUrl);
        return;
      }

      setResolvedUrl('');
    };

    resolveUrl();
  }, [
    photo.cloudinaryUrl,
    photo.local_uri,
    photo.filename,
    isLoading,
    system?.attachmentQueue,
  ]);

  return (
    <View className='w-1/3 aspect-square p-1'>
      <TouchableOpacity
        onPress={() => onPhotoPress?.(index)}
        className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative shadow-sm'
        activeOpacity={0.8}
        disabled={isDeleting}
      >
        {imageError || !resolvedUrl ? (
          <View className='w-full h-full bg-gray-200 items-center justify-center'>
            <Text className='text-gray-500 font-medium'>Image</Text>
          </View>
        ) : resolvedUrl.startsWith('file:') ? (
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
          />
        )}

        {isLoading && (
          <View className='absolute inset-0 flex items-center justify-center bg-black/40'>
            <View className='bg-black/70 p-3 rounded-lg items-center'>
              <ActivityIndicator size='small' color='#ffffff' />
              <Text className='text-white text-xs font-bold mt-2 px-2 text-center'>
                Uploading...
              </Text>
            </View>
          </View>
        )}

        <View className='absolute bottom-0 left-0 right-0 bg-black/40 py-1'>
          <Text className='text-white text-[10px] text-center font-medium'>
            {new Date(photo.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onDelete(photo.id)}
          className={`absolute top-2 right-2 ${
            isLoading ? 'bg-gray-400' : 'bg-red-500'
          } w-[22px] h-[22px] rounded-full items-center justify-center opacity-90`}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          disabled={isDeleting}
        >
          <Text className='text-white text-xs font-bold leading-[18px]'>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}
