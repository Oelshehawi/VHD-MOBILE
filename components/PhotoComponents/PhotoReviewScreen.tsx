import { View, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

interface PhotoReviewScreenProps {
  photos: string[]; // Local URIs
  onUpload: (photoUris: string[]) => void;
  onCancel: () => void;
  onBack: () => void;
  onDeletePhoto: (index: number) => void;
  type: 'before' | 'after';
}

export function PhotoReviewScreen({
  photos,
  onUpload,
  onCancel,
  onBack,
  onDeletePhoto,
  type
}: PhotoReviewScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className='flex-1 bg-white'>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16 }} className='px-6 pb-4 border-b border-gray-200'>
        <Text variant='h2' className='text-gray-900'>
          Review Photos
        </Text>
        <Text variant='muted' className='mt-1'>
          {photos.length} photo{photos.length !== 1 ? 's' : ''} captured
        </Text>
      </View>

      {/* Photo Grid */}
      <ScrollView className='flex-1 px-4 py-4'>
        <View className='flex-row flex-wrap'>
          {photos.map((uri, index) => (
            <View key={index} className='w-1/3 aspect-square p-1'>
              <View className='flex-1 rounded-xl overflow-hidden bg-gray-100 relative'>
                <Image source={{ uri }} className='w-full h-full' resizeMode='cover' />
                {/* Delete Button */}
                <TouchableOpacity
                  onPress={() => onDeletePhoto(index)}
                  className='absolute top-2 right-2 bg-red-500 w-6 h-6 rounded-full items-center justify-center'
                  activeOpacity={0.8}
                >
                  <Ionicons name='close' size={16} color='white' />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={{ paddingBottom: insets.bottom + 24 }}
        className='px-6 pt-4 border-t border-gray-200'
      >
        {/* Primary action - full width */}
        <Button
          variant='default'
          className={cn('w-full mb-3', type === 'before' ? 'bg-blue-500' : 'bg-green-500')}
          onPress={() => onUpload(photos)}
          disabled={photos.length === 0}
        >
          <Text className='text-white font-semibold'>
            Upload {photos.length} Photo{photos.length !== 1 ? 's' : ''}
          </Text>
        </Button>

        {/* Secondary actions - side by side */}
        <View className='flex-row gap-3'>
          <Button variant='outline' className='flex-1' onPress={onBack}>
            <Text>Take More</Text>
          </Button>

          <Button variant='ghost' className='flex-1' onPress={onCancel}>
            <Text className='text-red-500'>Cancel</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
