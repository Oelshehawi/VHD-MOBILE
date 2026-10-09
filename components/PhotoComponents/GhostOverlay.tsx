import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

export const GHOST_OPACITY_STEPS = [0, 0.25, 0.4, 0.6] as const;

export interface GhostOption {
  id: string;
  uri: string;
}

// Remembered for the app session: last-used opacity, and the chosen Before per category.
let lastOpacity: number = 0.4;
const chosenGhostByCategory = new Map<string, string>();

export function getGhostOpacity() {
  return lastOpacity;
}

export function nextGhostOpacity(current: number): number {
  const index = GHOST_OPACITY_STEPS.findIndex((step) => step === current);
  lastOpacity = GHOST_OPACITY_STEPS[(index + 1) % GHOST_OPACITY_STEPS.length];
  return lastOpacity;
}

export function recallGhostChoice(categoryScope: string): string | undefined {
  return chosenGhostByCategory.get(categoryScope);
}

export function rememberGhostChoice(categoryScope: string, id: string) {
  chosenGhostByCategory.set(categoryScope, id);
}

/** Semi-transparent Before photo over the preview, cropped the same way (cover) to line up After shots. */
export function GhostOverlay({ uri, opacity }: { uri: string | null; opacity: number }) {
  if (!uri || opacity === 0) return null;
  return (
    <Image
      pointerEvents='none'
      source={{ uri }}
      contentFit='cover'
      transition={0}
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  );
}

interface GhostControlsProps {
  options: readonly GhostOption[];
  selectedId: string | null;
  opacity: number;
  onSelect: (id: string) => void;
  onCycleOpacity: () => void;
}

export function GhostControls({ options, selectedId, opacity, onSelect, onCycleOpacity }: GhostControlsProps) {
  return (
    <View className='absolute bottom-2 left-2 right-2 flex-row items-center gap-2' pointerEvents='box-none'>
      <Pressable
        onPress={onCycleOpacity}
        accessibilityLabel='Change before-photo overlay opacity'
        className='h-12 items-center justify-center rounded-xl bg-black/60 px-3'
      >
        <Text className='text-[10px] font-semibold uppercase text-white/70'>Ghost</Text>
        <Text className='text-sm font-bold text-white'>{Math.round(opacity * 100)}%</Text>
      </Pressable>
      {opacity > 0 && options.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              className={`h-12 w-9 overflow-hidden rounded-md border-2 ${
                option.id === selectedId ? 'border-white' : 'border-transparent'
              }`}
            >
              <Image source={{ uri: option.uri }} recyclingKey={option.id} contentFit='cover' style={{ flex: 1 }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
