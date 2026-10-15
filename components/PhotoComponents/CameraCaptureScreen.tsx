import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type {
  CaptureTarget,
  CaptureType,
  DocumentationCategory
} from '@/utils/equipmentCategories';
import { CaptureTargetChips } from './CaptureTargetChips';
import { GhostControls, GhostOverlay, type GhostOption } from './GhostOverlay';

export interface CapturedPicture {
  uri: string;
  width: number;
  height: number;
}

export interface GhostState {
  uri: string | null;
  options: readonly GhostOption[];
  selectedId: string | null;
  opacity: number;
  onSelect: (id: string) => void;
  onCycleOpacity: () => void;
}

interface CameraCaptureScreenProps {
  categories: readonly DocumentationCategory[];
  target: CaptureTarget;
  countFor: (type: CaptureType, categoryKey: string | null) => number;
  onTargetChange: (target: CaptureTarget) => void;
  onCaptured: (picture: CapturedPicture) => void;
  onClose: () => void;
  lastShot: { uri: string; busy: boolean; failed: boolean } | null;
  sessionCount: number;
  saveStatus: { saved: number; saving: number; failed: number };
  onOpenSession: () => void;
  ghost: GhostState | null;
  /** Extra top-bar control, e.g. the camera-roll backup toggle. */
  topAccessory?: ReactNode;
}

const BOTTOM_BAR_HEIGHT = 112;

export function CameraCaptureScreen({
  categories,
  target,
  countFor,
  onTargetChange,
  onCaptured,
  onClose,
  lastShot,
  sessionCount,
  saveStatus,
  onOpenSession,
  ghost,
  topAccessory
}: CameraCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const zoomShared = useSharedValue(0);
  const startZoom = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const cameraRef = useRef<CameraView>(null);
  const isCapturingRef = useRef(false);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const handleTakePicture = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady || isCapturingRef.current) return;

    isCapturingRef.current = true;
    flashOpacity.value = withSequence(withTiming(0.6, { duration: 40 }), withTiming(0, { duration: 180 }));
    try {
      // Width/height come back with the result, so no decode is needed to size the upload.
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) {
        onCaptured({ uri: picture.uri, width: picture.width, height: picture.height });
      }
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Capture Failed', 'Unable to take photo.');
    } finally {
      isCapturingRef.current = false;
    }
  }, [isCameraReady, onCaptured, flashOpacity]);

  const toggleFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setZoom(0);
    zoomShared.value = 0;
  };

  const toggleFlash = () => {
    setFlash((current) => (current === 'off' ? 'on' : current === 'on' ? 'auto' : 'off'));
  };

  const updateZoom = useCallback(
    (newZoom: number) => {
      setZoom(newZoom);
      zoomShared.value = newZoom;
    },
    [zoomShared]
  );

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      startZoom.value = zoomShared.value;
    })
    .onUpdate((event) => {
      'worklet';
      const newZoom = Math.min(Math.max(startZoom.value + (event.scale - 1) * 0.5, 0), 1);
      scheduleOnRN(updateZoom, newZoom);
    });

  if (!permission) {
    return (
      <View className='flex-1 items-center justify-center bg-black p-6'>
        <ActivityIndicator color='#FFFFFF' />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className='flex-1 items-center justify-center bg-black p-6'>
        <Ionicons name='camera-outline' size={64} color='#9CA3AF' />
        <Text className='mb-4 mt-6 text-center text-2xl font-semibold text-white'>
          Camera Permission Required
        </Text>
        <Text className='mb-8 px-4 text-center text-sm text-gray-400'>
          Enable camera access to capture photos of work completed.
        </Text>
        <Pressable onPress={requestPermission} style={{ backgroundColor: '#3B82F6' }} className='mb-3 rounded-lg px-8 py-3'>
          <Text className='text-base font-semibold text-white'>Enable Camera</Text>
        </Pressable>
        <Pressable onPress={onClose} className='rounded-lg border border-gray-600 px-8 py-3'>
          <Text className='text-base font-semibold text-gray-300'>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <View style={{ paddingTop: insets.top }} className='flex-row items-center justify-between px-3 pb-1'>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel='Close camera' className='h-11 w-11 items-center justify-center'>
          <Ionicons name='close' size={28} color='white' />
        </Pressable>
        <View className='flex-row items-center gap-2'>
          {topAccessory}
          <Pressable
            onPress={toggleFlash}
            accessibilityLabel={`Flash ${flash}`}
            className='flex-row items-center rounded-full bg-white/10 px-3 py-2'
          >
            <Ionicons
              name={flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off'}
              size={18}
              color={flash === 'off' ? '#9CA3AF' : '#FFD700'}
            />
            <Text className='ml-1 text-xs font-medium uppercase text-white'>{flash}</Text>
          </Pressable>
        </View>
      </View>

      <CaptureTargetChips categories={categories} target={target} countFor={countFor} onChange={onTargetChange} />

      <View className='flex-1 overflow-hidden bg-[#1a1a1a]'>
        <GestureDetector gesture={pinchGesture}>
          <View style={{ flex: 1 }}>
            <CameraView
              ref={cameraRef}
              facing={facing}
              flash={flash}
              zoom={zoom}
              onCameraReady={() => setIsCameraReady(true)}
              responsiveOrientationWhenOrientationLocked
              style={{ flex: 1 }}
              ratio='4:3'
            />
            {ghost && <GhostOverlay uri={ghost.uri} opacity={ghost.opacity} />}
            <Animated.View pointerEvents='none' className='absolute inset-0 bg-white' style={flashStyle} />
          </View>
        </GestureDetector>
        <SaveStatusBadge sessionCount={sessionCount} status={saveStatus} />
        {ghost && (
          <GhostControls
            options={ghost.options}
            selectedId={ghost.selectedId}
            opacity={ghost.opacity}
            onSelect={ghost.onSelect}
            onCycleOpacity={ghost.onCycleOpacity}
          />
        )}
      </View>

      <View
        style={{ height: BOTTOM_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
        className='flex-row items-center justify-between px-8'
      >
        <Pressable
          onPress={onOpenSession}
          disabled={!lastShot}
          accessibilityLabel={`Review ${sessionCount} photos from this session`}
          className='h-14 w-14 overflow-hidden rounded-xl border-2 border-white/80 bg-white/10'
        >
          {lastShot && (
            <>
              <Image source={{ uri: lastShot.uri }} contentFit='cover' transition={0} style={{ flex: 1 }} />
              {(lastShot.busy || lastShot.failed) && (
                <View className={`absolute inset-0 items-center justify-center ${lastShot.failed ? 'bg-red-700/70' : 'bg-black/40'}`}>
                  {lastShot.failed ? (
                    <Ionicons name='alert' size={22} color='#FFFFFF' />
                  ) : (
                    <ActivityIndicator size='small' color='#FFFFFF' />
                  )}
                </View>
              )}
              <View className='absolute bottom-0 right-0 rounded-tl-md bg-black/70 px-1'>
                <Text className='text-[10px] font-bold text-white'>{sessionCount}</Text>
              </View>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={handleTakePicture}
          disabled={!isCameraReady}
          accessibilityLabel='Take photo'
          style={{
            width: 78,
            height: 78,
            borderRadius: 39,
            backgroundColor: isCameraReady ? '#FFFFFF' : '#666666',
            borderWidth: 4,
            borderColor: target.type === 'before' ? '#3B82F6' : '#10B981'
          }}
        />

        <Pressable
          onPress={toggleFacing}
          accessibilityLabel='Flip camera'
          className='h-14 w-14 items-center justify-center rounded-full bg-gray-800/90'
        >
          <Ionicons name='camera-reverse' size={24} color='#FFF' />
        </Pressable>
      </View>
    </View>
  );
}

/** Tells the tech every shot is kept, so closing the camera never feels risky. */
function SaveStatusBadge({
  sessionCount,
  status
}: {
  sessionCount: number;
  status: { saved: number; saving: number; failed: number };
}) {
  const { label, icon, tone } =
    status.failed > 0
      ? { label: `${status.failed} not saved – tap the thumbnail`, icon: 'alert-circle' as const, tone: 'bg-red-700/90' }
      : status.saving > 0
        ? { label: `Saving ${status.saving}…`, icon: 'sync' as const, tone: 'bg-black/60' }
        : sessionCount > 0
          ? { label: `${status.saved} saved to this job`, icon: 'checkmark-circle' as const, tone: 'bg-black/60' }
          : { label: 'Photos save automatically', icon: 'information-circle' as const, tone: 'bg-black/40' };

  return (
    <View pointerEvents='none' className='absolute left-0 right-0 top-3 items-center'>
      <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${tone}`}>
        <Ionicons name={icon} size={14} color='#FFFFFF' />
        <Text className='text-xs font-semibold text-white'>{label}</Text>
      </View>
    </View>
  );
}
