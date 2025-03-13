import {
  Image,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { PhotoType } from '@/utils/photos';
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
  const isLocalUrl = photo.url?.startsWith('local://');
  const isPending = photo.status === 'pending' || isLocalUrl;
  const isFailed = photo.status === 'failed';

  return (
    <View className='w-1/3 aspect-square p-1'>
      <TouchableOpacity
        onPress={() => onPhotoPress?.(index)}
        className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative shadow-sm'
        activeOpacity={0.8}
        disabled={isDeleting}
      >
        <Image
          source={{ uri: photo.url }}
          className='w-full h-full'
          resizeMode='cover'
        />

        {/* Status indicator */}
        {isPending && (
          <View className='absolute inset-0 flex items-center justify-center bg-black/20'>
            <ActivityIndicator size='large' color='#ffffff' />
          </View>
        )}

        {/* Failed upload indicator */}
        {isFailed && (
          <View className='absolute top-2 left-2 w-5 h-5 rounded-full justify-center items-center bg-red-500'>
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
          onPress={() => onDelete(photoId as string, photo.url || '', photo.attachmentId)}
          className='absolute top-2 right-2 bg-red-500 w-[22px] h-[22px] rounded-full items-center justify-center opacity-90'
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          disabled={isDeleting}
        >
          <Text className='text-white text-xs font-bold leading-[18px]'>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}
