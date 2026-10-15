import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import { ToastViewport } from '@/components/common/Toast';
import type { PhotoCategoryKind } from '@/types';
import {
  selectCategoryPhotos,
  useEquipmentProfile,
  useSchedulePhotoCounts,
  useSchedulePhotos
} from '@/services/data/photos';
import {
  buildDocumentationCategories,
  getAdjacentCategoryKey,
  getCategoryIcon,
  isOptionalCategory,
  type CaptureTarget,
  type CaptureType,
  type DocumentationCategory
} from '@/utils/equipmentCategories';
import { captureTypeLabel, type PhotoJobContext } from '@/utils/photoImport';
import { JobPhotoHistory } from './JobPhotoHistory';
import { EquipmentPhotoScreen } from './EquipmentPhotoScreen';
import { NoTechnicianNotice } from './NoTechnicianNotice';
import { VisitPhotoImport } from './VisitPhotoImport';
import { CameraCaptureModal } from './CameraCaptureModal';
import { BeforeAfterCompare } from './BeforeAfterCompare';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  serviceJobId?: string | null;
  jobTitle: string;
  scheduledStartAtUtc: string;
  timeZone?: string | null;
  technicianId: string;
}

function categoryTone(kind: PhotoCategoryKind) {
  if (kind === 'hood' || kind === 'hoodGroup') return '#D97706';
  if (kind === 'exhaustFan') return '#2563EB';
  if (kind === 'ecologyUnit') return '#059669';
  return '#6B7280';
}

function CountPill({
  type,
  count,
  optional
}: {
  type: CaptureType;
  count: number;
  optional: boolean;
}) {
  const missing = count === 0 && !optional;
  return (
    <View
      className={`flex-row items-center rounded-full px-2 py-1 ${
        missing
          ? 'bg-amber-100 dark:bg-amber-500/20'
          : count === 0
            ? 'bg-black/5 dark:bg-white/10'
            : type === 'before'
              ? 'bg-blue-100 dark:bg-blue-500/20'
              : 'bg-green-100 dark:bg-green-500/20'
      }`}
    >
      <Text
        className={`text-xs font-bold ${
          missing
            ? 'text-amber-900 dark:text-amber-200'
            : count === 0
              ? 'text-gray-500 dark:text-gray-400'
              : type === 'before'
                ? 'text-blue-800 dark:text-blue-200'
                : 'text-green-800 dark:text-green-200'
        }`}
      >
        {missing ? `needs ${type}` : `${captureTypeLabel(type)} ${count}`}
      </Text>
    </View>
  );
}

/**
 * Where the header Camera/Gallery should start: the first required equipment
 * still missing a before photo, then the first missing an after photo.
 */
function suggestTarget(
  categories: readonly DocumentationCategory[],
  countFor: (type: CaptureType, categoryKey: string | null) => number
): CaptureTarget {
  const required = categories.filter((category) => !isOptionalCategory(category));
  for (const type of ['before', 'after'] as const) {
    const missing = required.find((category) => countFor(type, category.key) === 0);
    if (missing) return { type, categoryKey: missing.key };
  }
  return { type: 'before', categoryKey: (required[0] ?? categories[0])?.key ?? null };
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  serviceJobId,
  jobTitle,
  scheduledStartAtUtc,
  timeZone,
  technicianId
}: PhotoDocumentationModalProps) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const chevronColor = isDark ? '#C9C3BA' : '#76706A';

  // Keys, not category objects: categories are rebuilt whenever the profile row re-emits.
  // undefined = list; null = the Uncategorized bucket.
  const [detailKey, setDetailKey] = useState<string | null | undefined>(undefined);
  const [importTarget, setImportTarget] = useState<{
    preset: CaptureTarget | null;
    type: CaptureType;
  } | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CaptureTarget | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const profile = useEquipmentProfile(serviceJobId);
  const categories = useMemo(() => buildDocumentationCategories(profile), [profile]);
  const categoryKeys = useMemo(() => categories.map((category) => category.key), [categories]);
  const { data: photos = [] } = useSchedulePhotos(scheduleId);
  const counts = useSchedulePhotoCounts(photos);
  // Photos are owned by a technician record; without one the server rejects them.
  const canAdd = !!technicianId;

  const ctx: PhotoJobContext = useMemo(
    () => ({ scheduleId, technicianId, jobTitle, scheduledStartAtUtc, timeZone }),
    [scheduleId, technicianId, jobTitle, scheduledStartAtUtc, timeZone]
  );

  // Keep showing the last equipment while its modal slides away.
  const isDetailOpen = detailKey !== undefined;
  const lastDetailKeyRef = useRef<string | null>(null);
  if (isDetailOpen) lastDetailKeyRef.current = detailKey;
  const shownKey = isDetailOpen ? detailKey : lastDetailKeyRef.current;
  const shownIndex = shownKey ? categoryKeys.indexOf(shownKey) : -1;
  const shownCategory = shownIndex >= 0 ? categories[shownIndex] : null;
  const uncategorizedCount = counts.get('before', null) + counts.get('after', null);

  const handleClose = () => {
    setDetailKey(undefined);
    onClose();
  };

  const stepCategory = (dir: 1 | -1) => {
    const next = getAdjacentCategoryKey(categoryKeys, shownKey ?? null, dir);
    return next ? () => setDetailKey(next) : null;
  };

  const openHeaderCamera = () => setCameraTarget(suggestTarget(categories, counts.get));
  const openHeaderGallery = () =>
    setImportTarget({ preset: null, type: suggestTarget(categories, counts.get).type });

  if (!visible) return null;

  // Camera, gallery and compare open over whichever modal is on top, so
  // they render inside the equipment modal while it is open.
  const overlays: ReactNode = (
    <>
      {cameraTarget && (
        <CameraCaptureModal
          visible
          onClose={() => setCameraTarget(null)}
          ctx={ctx}
          categories={categories}
          initialTarget={cameraTarget}
          photos={photos}
        />
      )}

      {showCompare && isDetailOpen && (
        <BeforeAfterCompare
          visible
          onClose={() => setShowCompare(false)}
          title={shownCategory?.label ?? 'Uncategorized'}
          beforePhotos={selectCategoryPhotos(photos, 'before', shownKey ?? null)}
          afterPhotos={selectCategoryPhotos(photos, 'after', shownKey ?? null)}
        />
      )}

      {importTarget && (
        <VisitPhotoImport
          visible
          onClose={() => setImportTarget(null)}
          ctx={ctx}
          categories={categories}
          defaultType={importTarget.type}
          presetTarget={importTarget.preset}
          visitPhotos={photos}
        />
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={handleClose}
      presentationStyle='fullScreen'
      animationType='slide'
    >
      <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
        <View className='border-b border-black/10 bg-[#F7F5F1] px-4 py-3 dark:border-white/10 dark:bg-gray-950'>
          <View className='flex-row items-center gap-3'>
            <View className='flex-1'>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>Photos</Text>
              <Text className='mt-1 text-xs font-medium text-gray-500' numberOfLines={1}>
                {jobTitle}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              accessibilityLabel='Close photos'
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='close' size={22} color={iconColor} />
            </Pressable>
          </View>

          {canAdd ? (
            <View className='mt-3 flex-row gap-3'>
              <Pressable
                onPress={openHeaderCamera}
                accessibilityLabel='Take photos'
                className='min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#14110F] active:opacity-80 dark:bg-white'
              >
                <Ionicons name='camera' size={20} color={isDark ? '#14110F' : '#FFFFFF'} />
                <Text className='text-base font-bold text-white dark:text-[#14110F]'>Camera</Text>
              </Pressable>
              <Pressable
                onPress={openHeaderGallery}
                accessibilityLabel='Add photos from gallery'
                className='min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-black/15 bg-white active:bg-gray-50 dark:border-white/20 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
              >
                <Ionicons name='images-outline' size={20} color={iconColor} />
                <Text className='text-base font-bold text-[#14110F] dark:text-white'>Gallery</Text>
              </Pressable>
            </View>
          ) : (
            <NoTechnicianNotice />
          )}
        </View>

        <ScrollView
          className='flex-1'
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        >
          <View className='px-4 pt-4'>
            <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
              Current Visit By Equipment
            </Text>
            <View className='gap-3'>
              {categories.map((category) => {
                const color = categoryTone(category.kind);
                const optional = isOptionalCategory(category);
                return (
                  <Pressable
                    key={category.key}
                    onPress={() => setDetailKey(category.key)}
                    className='rounded-2xl border border-black/10 bg-white p-4 active:bg-gray-50 dark:border-white/10 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
                  >
                    <View className='flex-row items-center gap-3'>
                      <View
                        className='h-12 w-12 items-center justify-center rounded-xl'
                        style={{ backgroundColor: `${color}22` }}
                      >
                        <Ionicons
                          name={getCategoryIcon(category.kind) as any}
                          size={24}
                          color={color}
                        />
                      </View>
                      <View className='flex-1 gap-1.5'>
                        <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                          {category.label}
                        </Text>
                        <View className='flex-row gap-2'>
                          <CountPill
                            type='before'
                            count={counts.get('before', category.key)}
                            optional={optional}
                          />
                          <CountPill
                            type='after'
                            count={counts.get('after', category.key)}
                            optional={optional}
                          />
                        </View>
                      </View>
                      <Ionicons name='chevron-forward' size={18} color={chevronColor} />
                    </View>
                  </Pressable>
                );
              })}

              {uncategorizedCount > 0 && (
                <Pressable
                  onPress={() => setDetailKey(null)}
                  className='rounded-2xl border border-dashed border-black/20 bg-white p-4 dark:border-white/20 dark:bg-[#16140F]'
                >
                  <View className='flex-row items-center gap-3'>
                    <View className='h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-[#2A261D]'>
                      <Ionicons name='images-outline' size={24} color={chevronColor} />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                        Uncategorized
                      </Text>
                      <Text className='mt-1 text-xs font-medium text-gray-500'>
                        Before {counts.get('before', null)} · After {counts.get('after', null)}
                      </Text>
                    </View>
                    <Ionicons name='chevron-forward' size={18} color={chevronColor} />
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {serviceJobId && (
            <View className='mt-6 px-4'>
              <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                Previous Visits
              </Text>
              <JobPhotoHistory
                scheduleId={scheduleId}
                serviceJobId={serviceJobId}
                jobTitle={jobTitle}
              />
            </View>
          )}
        </ScrollView>
      </View>

      <Modal
        visible={isDetailOpen}
        onRequestClose={() => setDetailKey(undefined)}
        presentationStyle='fullScreen'
        animationType='slide'
      >
        <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
          <EquipmentPhotoScreen
            title={shownCategory?.label ?? 'Uncategorized'}
            jobTitle={jobTitle}
            position={shownCategory ? { index: shownIndex, total: categories.length } : null}
            optional={!shownCategory || isOptionalCategory(shownCategory)}
            canAdd={canAdd}
            beforePhotos={selectCategoryPhotos(photos, 'before', shownKey ?? null)}
            afterPhotos={selectCategoryPhotos(photos, 'after', shownKey ?? null)}
            onClose={() => setDetailKey(undefined)}
            onPrev={shownCategory ? stepCategory(-1) : null}
            onNext={shownCategory ? stepCategory(1) : null}
            onCamera={(type) => setCameraTarget({ type, categoryKey: shownKey ?? null })}
            onGallery={(type) =>
              setImportTarget({ preset: { type, categoryKey: shownKey ?? null }, type })
            }
            onCompare={() => setShowCompare(true)}
          />
        </View>
        {isDetailOpen && overlays}
        <ToastViewport />
      </Modal>

      {!isDetailOpen && overlays}
      <ToastViewport />
    </Modal>
  );
}
