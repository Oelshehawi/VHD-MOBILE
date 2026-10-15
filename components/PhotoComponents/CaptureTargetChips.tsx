import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type {
  CaptureTarget,
  CaptureType,
  DocumentationCategory
} from '@/utils/equipmentCategories';
import { captureTypeLabel } from '@/utils/photoImport';

interface CaptureTargetChipsProps {
  categories: readonly DocumentationCategory[];
  target: CaptureTarget;
  countFor: (type: CaptureType, categoryKey: string | null) => number;
  onChange: (target: CaptureTarget) => void;
}

/** Before/After toggle plus an equipment strip with live counts, for the camera. */
export function CaptureTargetChips({ categories, target, countFor, onChange }: CaptureTargetChipsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const chipX = useRef(new Map<string, number>());
  const options = categories.map(({ key, label }) => ({ key, label }));

  // Keep the selected chip in view when the target changes from outside.
  useEffect(() => {
    const x = chipX.current.get(target.categoryKey ?? '');
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(x - 24, 0), animated: true });
  }, [target.categoryKey]);

  return (
    <View className='flex-row items-center bg-black py-2'>
      <View className='ml-3 flex-row rounded-full bg-white/10 p-1'>
        {(['before', 'after'] as const).map((type) => {
          const active = target.type === type;
          return (
            <Pressable
              key={type}
              onPress={() => onChange({ ...target, type })}
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
              className={`rounded-full px-3 py-2 ${active ? (type === 'before' ? 'bg-blue-500' : 'bg-emerald-500') : ''}`}
            >
              <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-white/70'}`}>
                {captureTypeLabel(type)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}
      >
        {options.map((option) => {
          const active = option.key === target.categoryKey;
          const count = countFor(target.type, option.key);
          return (
            <Pressable
              key={option.key}
              onLayout={(event) => chipX.current.set(option.key, event.nativeEvent.layout.x)}
              onPress={() => onChange({ ...target, categoryKey: option.key })}
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
              className={`min-h-10 flex-row items-center gap-1.5 rounded-full border px-3 ${
                active ? 'border-white bg-white' : 'border-white/25 bg-white/5'
              }`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-black' : 'text-white'}`} numberOfLines={1}>
                {option.label}
              </Text>
              <View
                className={`min-w-5 items-center rounded-full px-1.5 ${
                  count === 0 ? 'bg-amber-400' : active ? 'bg-black/10' : 'bg-white/15'
                }`}
              >
                <Text className={`text-xs font-bold ${count === 0 ? 'text-black' : active ? 'text-black' : 'text-white'}`}>
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
