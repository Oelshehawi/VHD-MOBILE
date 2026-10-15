import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import { ToastViewport } from '@/components/common/Toast';
import { useSystem } from '@/services/database/System';
import { useImportLedger, type DocumentationPhoto } from '@/services/data/photos';
import { describeImportResult, importAssignments } from '@/services/photos/photoImporter';
import { pickWithSystemPicker } from '@/services/photos/pickerImport';
import type {
  CaptureTarget,
  CaptureType,
  DocumentationCategory
} from '@/utils/equipmentCategories';
import {
  buildImportStatus,
  describeTarget,
  type ImportAssignment,
  type ImportCandidate,
  type PhotoJobContext
} from '@/utils/photoImport';
import { showToast } from '@/utils/photos';
import { debugLogger } from '@/utils/DebugLogger';
import { PhotoSortStep } from './PhotoSortStep';

type Step = 'picking' | 'sort' | 'saving';

interface VisitPhotoImportProps {
  visible: boolean;
  onClose: () => void;
  ctx: PhotoJobContext;
  categories: readonly DocumentationCategory[];
  defaultType: CaptureType;
  /** Opened from an equipment section: every photo goes here and sorting is skipped. */
  presetTarget: CaptureTarget | null;
  visitPhotos: ReadonlyArray<DocumentationPhoto>;
}

export function VisitPhotoImport({
  visible,
  onClose,
  ctx,
  categories,
  defaultType,
  presetTarget,
  visitPhotos
}: VisitPhotoImportProps) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const system = useSystem();
  const { data: ledger = [], isLoading: isLedgerLoading } = useImportLedger();
  const [step, setStep] = useState<Step>('picking');
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const launchedRef = useRef(false);
  // Read at pick time: the ledger may finish loading while the picker is open.
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  const statuses = useMemo(
    () =>
      buildImportStatus(
        candidates,
        ledger,
        visitPhotos.map((photo) => photo.timestamp),
        ctx.scheduleId
      ),
    [candidates, ledger, visitPhotos, ctx.scheduleId]
  );

  const runImport = useCallback(
    async (assignments: ImportAssignment[], skipped = 0) => {
      const queue = system?.attachmentQueue;
      if (!queue) {
        showToast('Photo storage is still starting – try again in a moment', { tone: 'error' });
        onClose();
        return;
      }

      setStep('saving');
      try {
        const result = await importAssignments(queue, assignments, ctx, categories, {
          onProgress: setProgress
        });
        const { message, isError } = describeImportResult(result);
        const skippedNote = skipped > 0 ? ` · ${skipped} already imported` : '';
        showToast(`${message}${skippedNote}`, { tone: isError ? 'error' : 'success' });
      } catch (error) {
        void debugLogger.info('PHOTO', 'Photo import failed', {
          error: error instanceof Error ? error.message : String(error)
        });
        showToast('Failed to save photos. Please try again.', { tone: 'error' });
      } finally {
        onClose();
      }
    },
    [system?.attachmentQueue, ctx, categories, onClose]
  );

  const launchPicker = useCallback(async () => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    try {
      const picked = await pickWithSystemPicker();
      if (!picked) {
        onClose();
        return;
      }

      if (presetTarget) {
        const fresh = picked.filter(
          (candidate) => !candidate.assetId || !ledgerRef.current.some(
            (entry) => entry.assetId === candidate.assetId && entry.scheduleId === ctx.scheduleId
          )
        );
        await runImport(
          fresh.map((candidate) => ({ candidate, target: presetTarget })),
          picked.length - fresh.length
        );
        return;
      }

      setCandidates(picked);
      setStep('sort');
    } catch (error) {
      void debugLogger.info('PHOTO', 'Photo picker failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      showToast('Could not open your photos', { tone: 'error' });
      onClose();
    }
  }, [onClose, presetTarget, ctx.scheduleId, runImport]);

  const requestClose = () => {
    if (step !== 'saving') onClose();
  };

  const title =
    step === 'sort' ? 'Sort photos' : presetTarget ? describeTarget(presetTarget, categories) : 'Gallery';

  return (
    <Modal
      visible={visible}
      onRequestClose={requestClose}
      // The system picker can only present once this Modal has finished presenting.
      onShow={() => void launchPicker()}
      presentationStyle='fullScreen'
      animationType='slide'
    >
      <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
        <View className='flex-row items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10'>
          <View className='flex-1'>
            <Text className='text-xl font-bold text-[#14110F] dark:text-white' numberOfLines={1}>
              {title}
            </Text>
            <Text className='text-xs font-medium text-gray-500' numberOfLines={1}>
              {ctx.jobTitle}
            </Text>
          </View>
          {step !== 'saving' && (
            <Pressable
              onPress={requestClose}
              hitSlop={10}
              accessibilityLabel='Cancel adding photos'
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='close' size={22} color={isDark ? '#F2EFEA' : '#14110F'} />
            </Pressable>
          )}
        </View>

        {step === 'sort' && !isLedgerLoading ? (
          <PhotoSortStep
            candidates={candidates}
            categories={categories}
            statuses={statuses}
            defaultType={defaultType}
            onImport={(assignments) => void runImport(assignments)}
          />
        ) : step === 'saving' ? (
          <View className='flex-1 items-center justify-center px-8'>
            <ActivityIndicator size='large' color='#2563EB' />
            <Text className='mt-4 text-lg font-semibold text-[#14110F] dark:text-white'>
              Saving {Math.min(progress.done + 1, progress.total)} of {progress.total}
            </Text>
            <View className='mt-4 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10'>
              <View
                className='h-full rounded-full bg-blue-600'
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </View>
            <Text className='mt-3 text-center text-xs text-gray-500'>
              Keep the app open. Photos upload in the background once saved.
            </Text>
          </View>
        ) : (
          <View className='flex-1 items-center justify-center'>
            <ActivityIndicator size='large' color='#2563EB' />
            <Text className='mt-3 text-sm text-gray-500'>Opening your photos…</Text>
          </View>
        )}
      </View>
      <ToastViewport />
    </Modal>
  );
}
