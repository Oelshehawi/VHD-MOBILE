import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ImportCandidate } from '@/utils/photoImport';

export interface TileBadge {
  label: string;
  tone: 'success' | 'warning' | 'muted';
}

interface ImportPhotoTileProps {
  candidate: ImportCandidate;
  size: number;
  selected: boolean;
  dimmed?: boolean;
  badge?: TileBadge | null;
  caption?: string | null;
  captionTone?: 'before' | 'after' | null;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
}

const BADGE_CLASSES: Record<TileBadge['tone'], string> = {
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  muted: 'bg-black/60'
};

function ImportPhotoTileComponent({
  candidate,
  size,
  selected,
  dimmed = false,
  badge,
  caption,
  captionTone,
  onPress,
  onLongPress
}: ImportPhotoTileProps) {
  return (
    <Pressable
      onPress={() => onPress(candidate.id)}
      onLongPress={onLongPress ? () => onLongPress(candidate.id) : undefined}
      accessibilityRole='checkbox'
      accessibilityState={{ checked: selected }}
      style={{ width: size, height: size, padding: 1.5 }}
    >
      <View className='flex-1 overflow-hidden rounded-md bg-gray-200 dark:bg-[#2A261D]'>
        <Image
          source={{ uri: candidate.uri }}
          recyclingKey={candidate.id}
          contentFit='cover'
          transition={0}
          style={{ width: '100%', height: '100%', opacity: dimmed ? 0.45 : 1 }}
        />

        {badge && (
          <View className={`absolute left-1 top-1 rounded px-1 py-0.5 ${BADGE_CLASSES[badge.tone]}`}>
            <Text className='text-[9px] font-bold text-white' numberOfLines={1}>
              {badge.label}
            </Text>
          </View>
        )}

        <View
          className={`absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full border-2 ${
            selected ? 'border-white bg-blue-600' : 'border-white/90 bg-black/20'
          }`}
        >
          {selected && <Ionicons name='checkmark' size={14} color='#FFFFFF' />}
        </View>

        {caption && (
          <View
            className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 ${
              captionTone === 'before'
                ? 'bg-blue-600/90'
                : captionTone === 'after'
                  ? 'bg-emerald-600/90'
                  : 'bg-black/60'
            }`}
          >
            <Text className='text-center text-[10px] font-semibold text-white' numberOfLines={1}>
              {caption}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const ImportPhotoTile = memo(ImportPhotoTileComponent);
