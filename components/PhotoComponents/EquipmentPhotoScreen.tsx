import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import type { DocumentationPhoto } from '@/services/data/photos';
import type { CaptureType } from '@/utils/equipmentCategories';
import { EquipmentPhotoSection } from './EquipmentPhotoSection';

interface EquipmentPhotoScreenProps {
  title: string;
  jobTitle: string;
  /** Position in the equipment list; null for the Uncategorized bucket. */
  position: { index: number; total: number } | null;
  beforePhotos: ReadonlyArray<DocumentationPhoto>;
  afterPhotos: ReadonlyArray<DocumentationPhoto>;
  onBack: () => void;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onCamera: (type: CaptureType) => void;
  onGallery: (type: CaptureType) => void;
  onCompare?: () => void;
}

function HeaderButton({
  icon,
  onPress,
  label,
  color
}: {
  icon: 'chevron-back' | 'chevron-forward' | 'close' | 'arrow-back';
  onPress: (() => void) | null;
  label: string;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      hitSlop={6}
      accessibilityLabel={label}
      className={`h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F] ${
        onPress ? '' : 'opacity-30'
      }`}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

export function EquipmentPhotoScreen({
  title,
  jobTitle,
  position,
  beforePhotos,
  afterPhotos,
  onBack,
  onClose,
  onPrev,
  onNext,
  onCamera,
  onGallery,
  onCompare
}: EquipmentPhotoScreenProps) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const canCompare = !!onCompare && beforePhotos.length > 0 && afterPhotos.length > 0;

  return (
    <View className='flex-1'>
      <View className='border-b border-black/10 bg-[#F7F5F1] px-4 py-3 dark:border-white/10 dark:bg-gray-950'>
        <View className='flex-row items-center gap-2'>
          <HeaderButton icon='arrow-back' onPress={onBack} label='Back to equipment list' color={iconColor} />
          <View className='flex-1 px-1'>
            <Text className='text-xl font-bold text-[#14110F] dark:text-white' numberOfLines={1}>
              {title}
            </Text>
            <Text className='text-xs font-medium text-gray-500' numberOfLines={1}>
              {position ? `${position.index + 1} of ${position.total} · ` : ''}
              {jobTitle}
            </Text>
          </View>
          {position && (
            <>
              <HeaderButton icon='chevron-back' onPress={onPrev} label='Previous equipment' color={iconColor} />
              <HeaderButton icon='chevron-forward' onPress={onNext} label='Next equipment' color={iconColor} />
            </>
          )}
          <HeaderButton icon='close' onPress={onClose} label='Close photos' color={iconColor} />
        </View>
      </View>

      <ScrollView
        className='flex-1 px-4 pt-4'
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <EquipmentPhotoSection
          type='before'
          photos={beforePhotos}
          jobTitle={jobTitle}
          categoryLabel={title}
          onCamera={() => onCamera('before')}
          onGallery={() => onGallery('before')}
        />
        <EquipmentPhotoSection
          type='after'
          photos={afterPhotos}
          jobTitle={jobTitle}
          categoryLabel={title}
          onCamera={() => onCamera('after')}
          onGallery={() => onGallery('after')}
        />

        {onCompare && (
          <Pressable
            onPress={onCompare}
            disabled={!canCompare}
            className={`mb-4 min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F] ${
              canCompare ? 'active:bg-gray-50' : 'opacity-40'
            }`}
          >
            <Ionicons name='git-compare-outline' size={20} color={iconColor} />
            <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
              {canCompare ? 'Compare before & after' : 'Compare needs a before and an after'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
