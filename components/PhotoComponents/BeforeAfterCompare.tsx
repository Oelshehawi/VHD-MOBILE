import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSystem } from '@/services/database/System';
import type { DocumentationPhoto } from '@/services/data/photos';
import { resolvePhotoUri } from '@/utils/photoUri';

const COMPARE_WIDTH = 1080;
const STRIP_HEIGHT = 64;

interface BeforeAfterCompareProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  beforePhotos: ReadonlyArray<DocumentationPhoto>;
  afterPhotos: ReadonlyArray<DocumentationPhoto>;
}

type Mode = 'slider' | 'side';

function PhotoStrip({
  label,
  photos,
  selectedIndex,
  onSelect,
  uriFor,
  accent
}: {
  label: string;
  photos: ReadonlyArray<DocumentationPhoto>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  uriFor: (photo: DocumentationPhoto, width?: number) => string;
  accent: string;
}) {
  return (
    <View className='mt-3'>
      <Text className='mb-1 px-4 text-xs font-bold uppercase tracking-widest text-white/60'>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
        {photos.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => onSelect(index)}
            style={{ height: STRIP_HEIGHT, width: STRIP_HEIGHT * 0.75, borderColor: index === selectedIndex ? accent : 'transparent' }}
            className='overflow-hidden rounded-md border-2'
          >
            <Image source={{ uri: uriFor(photo, 240) }} recyclingKey={photo.id} contentFit='cover' style={{ flex: 1 }} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function BeforeAfterCompare({ visible, onClose, title, beforePhotos, afterPhotos }: BeforeAfterCompareProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const system = useSystem();
  const [mode, setMode] = useState<Mode>('slider');
  const [beforeIndex, setBeforeIndex] = useState(0);
  const [afterIndex, setAfterIndex] = useState(Math.max(afterPhotos.length - 1, 0));

  // Leave room for the header and both strips; keep the 3:4 photo shape.
  const reserved = insets.top + insets.bottom + 56 + 2 * (STRIP_HEIGHT + 28) + 24;
  const stageWidth = Math.min(width, ((height - reserved) * 3) / 4);
  const stageHeight = (stageWidth * 4) / 3;

  const divider = useSharedValue(stageWidth / 2);
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      divider.value = Math.min(Math.max(event.x, 0), stageWidth);
    })
    .onUpdate((event) => {
      'worklet';
      divider.value = Math.min(Math.max(event.x, 0), stageWidth);
    });

  const beforeClip = useAnimatedStyle(() => ({ width: divider.value }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: divider.value - 20 }] }));

  const uriFor = (photo: DocumentationPhoto, photoWidth = COMPARE_WIDTH) =>
    resolvePhotoUri(photo, system?.attachmentQueue, { width: photoWidth });
  const before = beforePhotos[Math.min(beforeIndex, beforePhotos.length - 1)];
  const after = afterPhotos[Math.min(afterIndex, afterPhotos.length - 1)];

  const tag = (text: string, side: 'left' | 'right') => (
    <View className={`absolute top-2 rounded-md bg-black/60 px-2 py-1 ${side === 'left' ? 'left-2' : 'right-2'}`}>
      <Text className='text-xs font-bold text-white'>{text}</Text>
    </View>
  );

  return (
    <Modal visible={visible} onRequestClose={onClose} presentationStyle='fullScreen' animationType='fade'>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className='h-14 flex-row items-center gap-3 px-4'>
          <Text className='flex-1 text-lg font-bold text-white' numberOfLines={1}>
            {title}
          </Text>
          <View className='flex-row rounded-full bg-white/10 p-1'>
            {(['slider', 'side'] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                className={`rounded-full px-3 py-1.5 ${mode === value ? 'bg-white' : ''}`}
              >
                <Text className={`text-xs font-bold ${mode === value ? 'text-black' : 'text-white/80'}`}>
                  {value === 'slider' ? 'Slider' : 'Side by side'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel='Close compare'>
            <Ionicons name='close' size={26} color='#FFFFFF' />
          </Pressable>
        </View>

        <View className='flex-1 items-center justify-center'>
          {before && after ? (
            mode === 'slider' ? (
              <GestureDetector gesture={pan}>
                <View style={{ width: stageWidth, height: stageHeight }} className='overflow-hidden'>
                  <Image source={{ uri: uriFor(after) }} contentFit='cover' style={{ width: stageWidth, height: stageHeight }} />
                  <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' }, beforeClip]}>
                    {/* Fixed full width so the Before layer is clipped, not squeezed. */}
                    <Image source={{ uri: uriFor(before) }} contentFit='cover' style={{ width: stageWidth, height: stageHeight }} />
                  </Animated.View>
                  <Animated.View
                    pointerEvents='none'
                    style={[{ position: 'absolute', top: 0, bottom: 0, width: 40, alignItems: 'center' }, handleStyle]}
                  >
                    <View className='w-0.5 flex-1 bg-white' />
                    <View className='absolute top-1/2 -mt-5 h-10 w-10 items-center justify-center rounded-full bg-white'>
                      <Ionicons name='code-outline' size={20} color='#000000' />
                    </View>
                  </Animated.View>
                  {tag('Before', 'left')}
                  {tag('After', 'right')}
                </View>
              </GestureDetector>
            ) : (
              <View className='flex-row' style={{ width }}>
                {[
                  { photo: before, label: 'Before' },
                  { photo: after, label: 'After' }
                ].map(({ photo, label }) => (
                  <View key={label} style={{ width: width / 2, height: ((width / 2) * 4) / 3 }} className='p-0.5'>
                    <Image source={{ uri: uriFor(photo) }} contentFit='cover' style={{ flex: 1 }} />
                    {tag(label, 'left')}
                  </View>
                ))}
              </View>
            )
          ) : (
            <Text className='text-sm text-white/70'>Needs at least one before and one after photo.</Text>
          )}
        </View>

        <PhotoStrip label='Before' photos={beforePhotos} selectedIndex={beforeIndex} onSelect={setBeforeIndex} uriFor={uriFor} accent='#3B82F6' />
        <PhotoStrip label='After' photos={afterPhotos} selectedIndex={afterIndex} onSelect={setAfterIndex} uriFor={uriFor} accent='#10B981' />
      </GestureHandlerRootView>
    </Modal>
  );
}
