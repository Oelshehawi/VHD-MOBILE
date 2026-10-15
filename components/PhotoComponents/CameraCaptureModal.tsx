import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePowerSync } from '@powersync/react-native';
import { ToastViewport } from '@/components/common/Toast';
import { useSystem } from '@/services/database/System';
import {
  selectCategoryPhotos,
  useSchedulePhotoCounts,
  type DocumentationPhoto
} from '@/services/data/photos';
import { captureSaveQueue } from '@/services/photos/captureSaveQueueInstance';
import type { CaptureJob } from '@/services/photos/captureSaveQueue';
import { deletePhotoWithAttachment } from '@/services/photos/deletePhoto';
import type { CaptureTarget, CaptureType, DocumentationCategory } from '@/utils/equipmentCategories';
import type { PhotoJobContext } from '@/utils/photoImport';
import { resolvePhotoUri } from '@/utils/photoUri';
import { showToast } from '@/utils/photos';
import { CameraCaptureScreen, type CapturedPicture, type GhostState } from './CameraCaptureScreen';
import { getGhostOpacity, nextGhostOpacity, recallGhostChoice, rememberGhostChoice } from './GhostOverlay';

const GHOST_WIDTH = 1080;

interface CameraCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  ctx: PhotoJobContext;
  categories: readonly DocumentationCategory[];
  initialTarget: CaptureTarget;
  /** Live visit photos; drives chip counts and the ghost overlay. */
  photos: ReadonlyArray<DocumentationPhoto>;
}

let sessionCounter = 0;

export function CameraCaptureModal({
  visible,
  onClose,
  ctx,
  categories,
  initialTarget,
  photos
}: CameraCaptureModalProps) {
  const system = useSystem();
  const queue = system?.attachmentQueue;
  const [sessionId] = useState(() => `camera-${Date.now()}-${++sessionCounter}`);
  const [target, setTarget] = useState<CaptureTarget>(initialTarget);
  const [showSession, setShowSession] = useState(false);
  const [ghostOpacity, setGhostOpacity] = useState(getGhostOpacity);
  const [ghostChoices, setGhostChoices] = useState<Record<string, string>>({});

  const allJobs = useSyncExternalStore(captureSaveQueue.subscribe, captureSaveQueue.getSnapshot);
  const sessionJobs = useMemo(() => allJobs.filter((job) => job.sessionId === sessionId), [allJobs, sessionId]);
  const counts = useSchedulePhotoCounts(photos);

  // A saved shot's row reaches the photos query a moment after the save
  // resolves. Count it until the row first appears, so chips never dip back.
  const seenPhotoIdsRef = useRef(new Set<string>());
  const photoIds = useMemo(() => new Set(photos.map((photo) => photo.id)), [photos]);
  photoIds.forEach((id) => seenPhotoIdsRef.current.add(id));

  const countFor = useCallback(
    (type: CaptureType, categoryKey: string | null) =>
      counts.get(type, categoryKey) +
      sessionJobs.filter((job) => {
        if (job.target.type !== type || job.target.categoryKey !== categoryKey) return false;
        if (job.status === 'pending' || job.status === 'saving') return true;
        return (
          job.status === 'saved' &&
          !!job.photoId &&
          !photoIds.has(job.photoId) &&
          !seenPhotoIdsRef.current.has(job.photoId)
        );
      }).length,
    [counts, sessionJobs, photoIds]
  );

  const saveStatus = useMemo(
    () => ({
      saved: sessionJobs.filter((job) => job.status === 'saved').length,
      saving: sessionJobs.filter((job) => job.status === 'pending' || job.status === 'saving').length,
      failed: sessionJobs.filter((job) => job.status === 'failed').length
    }),
    [sessionJobs]
  );

  const ghostScope = `${ctx.scheduleId}:${target.categoryKey ?? ''}`;
  const ghostOptions = useMemo(
    () =>
      selectCategoryPhotos(photos, 'before', target.categoryKey)
        .map((photo) => ({ id: photo.id, uri: resolvePhotoUri(photo, queue, { width: GHOST_WIDTH }) }))
        .filter((option) => option.uri),
    [photos, target.categoryKey, queue]
  );

  // Warm the cache so the ghost appears instantly when switching to After.
  useEffect(() => {
    const remote = photos
      .filter((photo) => photo.type === 'before')
      .map((photo) => resolvePhotoUri(photo, queue, { width: GHOST_WIDTH }))
      .filter((uri) => uri.startsWith('http'));
    if (remote.length > 0) void Image.prefetch(remote);
    // Once per camera opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ghost: GhostState | null = useMemo(() => {
    if (target.type !== 'after' || ghostOptions.length === 0) return null;
    const chosenId = ghostChoices[ghostScope] ?? recallGhostChoice(ghostScope);
    const chosen = ghostOptions.find((option) => option.id === chosenId) ?? ghostOptions[0];
    return {
      uri: chosen.uri,
      options: ghostOptions,
      selectedId: chosen.id,
      opacity: ghostOpacity,
      onSelect: (id) => {
        rememberGhostChoice(ghostScope, id);
        setGhostChoices((current) => ({ ...current, [ghostScope]: id }));
      },
      onCycleOpacity: () => setGhostOpacity((current) => nextGhostOpacity(current))
    };
  }, [target.type, ghostOptions, ghostScope, ghostOpacity, ghostChoices]);

  const handleCaptured = useCallback(
    (picture: CapturedPicture) => {
      const category = categories.find((entry) => entry.key === target.categoryKey);
      captureSaveQueue.enqueue({
        sessionId,
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
        takenAt: new Date().toISOString(),
        target,
        categoryLabel: category?.label ?? null,
        categoryKind: category?.kind ?? null,
        ctx
      });
    },
    [categories, target, sessionId, ctx]
  );

  const finish = useCallback(() => {
    captureSaveQueue.endSession(sessionId);
    onClose();
  }, [sessionId, onClose]);

  const handleClose = useCallback(() => {
    // Saved and still-saving shots are kept; only failed ones need a decision.
    const failedIds = sessionJobs.filter((job) => job.status === 'failed').map((job) => job.id);
    if (failedIds.length === 0) {
      finish();
      return;
    }

    Alert.alert(
      `${failedIds.length} photo${failedIds.length === 1 ? '' : 's'} didn't save`,
      'Retry saving, or discard them and close the camera.',
      [
        { text: 'Retry', onPress: () => captureSaveQueue.retry(failedIds) },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            captureSaveQueue.discard(failedIds);
            finish();
          }
        }
      ]
    );
  }, [sessionJobs, finish]);

  const lastJob = sessionJobs[sessionJobs.length - 1] ?? null;

  return (
    <Modal visible={visible} onRequestClose={handleClose} presentationStyle='fullScreen' animationType='slide'>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
        <CameraCaptureScreen
          categories={categories}
          target={target}
          countFor={countFor}
          onTargetChange={setTarget}
          onCaptured={handleCaptured}
          onClose={handleClose}
          lastShot={
            lastJob
              ? {
                  uri: lastJob.uri,
                  busy: lastJob.status === 'pending' || lastJob.status === 'saving',
                  failed: lastJob.status === 'failed'
                }
              : null
          }
          sessionCount={sessionJobs.length}
          saveStatus={saveStatus}
          onOpenSession={() => setShowSession(true)}
          ghost={ghost}
        />
        {showSession && (
          <SessionStrip jobs={sessionJobs} categories={categories} onClose={() => setShowSession(false)} />
        )}
        <ToastViewport placement='bottom' offset={120} />
      </GestureHandlerRootView>
    </Modal>
  );
}

function SessionStrip({
  jobs,
  categories,
  onClose
}: {
  jobs: readonly CaptureJob[];
  categories: readonly DocumentationCategory[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const powerSync = usePowerSync();
  const system = useSystem();
  const failedIds = jobs.filter((job) => job.status === 'failed').map((job) => job.id);
  const labelFor = (job: CaptureJob) =>
    `${job.target.type === 'before' ? 'B' : 'A'} · ${
      categories.find((category) => category.key === job.target.categoryKey)?.label ?? 'Uncategorized'
    }`;

  const confirmDelete = (job: CaptureJob) => {
    if (job.status === 'failed') {
      captureSaveQueue.discard([job.id]);
      return;
    }
    if (job.status !== 'saved' || !job.photoId || !powerSync) return;

    const photoId = job.photoId;
    Alert.alert('Delete this photo?', 'It will be removed from this visit.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhotoWithAttachment(powerSync, system?.attachmentQueue, photoId);
            captureSaveQueue.remove(job.id);
            showToast('Photo deleted');
          } catch {
            showToast('Failed to delete photo', { tone: 'error' });
          }
        }
      }
    ]);
  };

  return (
    <View className='absolute inset-x-0 bottom-0 bg-black/90 pt-3' style={{ paddingBottom: insets.bottom + 12 }}>
      <View className='mb-2 flex-row items-center justify-between px-4'>
        <Text className='text-base font-bold text-white'>This session · {jobs.length}</Text>
        <View className='flex-row items-center gap-4'>
          {failedIds.length > 0 && (
            <Pressable onPress={() => captureSaveQueue.retry(failedIds)}>
              <Text className='text-sm font-bold text-amber-400'>Retry {failedIds.length} failed</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel='Close session photos'>
            <Ionicons name='chevron-down' size={24} color='#FFFFFF' />
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }} showsHorizontalScrollIndicator={false}>
        {[...jobs].reverse().map((job) => (
          <View key={job.id} className='w-24'>
            <View className='h-32 w-24 overflow-hidden rounded-lg bg-white/10'>
              <Image source={{ uri: job.uri }} recyclingKey={job.id} contentFit='cover' style={{ flex: 1 }} />
              {(job.status === 'pending' || job.status === 'saving') && (
                <View className='absolute inset-0 items-center justify-center bg-black/40'>
                  <ActivityIndicator color='#FFFFFF' />
                </View>
              )}
              {job.status === 'failed' && (
                <View className='absolute inset-0 items-center justify-center bg-red-800/70 px-1'>
                  <Text className='text-center text-[10px] font-bold text-white'>Not saved</Text>
                </View>
              )}
              <Pressable
                onPress={() => confirmDelete(job)}
                disabled={job.status === 'pending' || job.status === 'saving'}
                hitSlop={8}
                accessibilityLabel='Delete photo'
                className='absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-red-600'
              >
                <Ionicons name='close' size={14} color='#FFFFFF' />
              </Pressable>
            </View>
            <Text className='mt-1 text-[10px] font-medium text-white/80' numberOfLines={1}>
              {labelFor(job)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
