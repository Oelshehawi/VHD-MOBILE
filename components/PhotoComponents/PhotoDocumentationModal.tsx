import { useMemo, useState } from 'react';
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
  type CaptureTarget,
  type CaptureType
} from '@/utils/equipmentCategories';
import { captureTypeLabel, type PhotoJobContext } from '@/utils/photoImport';
import { JobPhotoHistory } from './JobPhotoHistory';
import { EquipmentPhotoScreen } from './EquipmentPhotoScreen';
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
  /** Seeds the default capture type for the header Camera/Import actions. */
  initialMode?: CaptureType;
}

function categoryTone(kind: PhotoCategoryKind) {
  if (kind === 'hood' || kind === 'hoodGroup') return '#D97706';
  if (kind === 'exhaustFan') return '#2563EB';
  if (kind === 'ecologyUnit') return '#059669';
  return '#6B7280';
}

function CountPill({ type, count }: { type: CaptureType; count: number }) {
  const missing = count === 0;
  return (
    <View
      className={`flex-row items-center rounded-full px-2 py-1 ${
        missing ? 'bg-amber-100' : type === 'before' ? 'bg-blue-100' : 'bg-green-100'
      }`}
    >
      <Text
        className={`text-xs font-bold ${
          missing ? 'text-amber-900' : type === 'before' ? 'text-blue-800' : 'text-green-800'
        }`}
      >
        {missing ? `needs ${type}` : `${captureTypeLabel(type)[0]} ${count}`}
      </Text>
    </View>
  );
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  serviceJobId,
  jobTitle,
  scheduledStartAtUtc,
  timeZone,
  technicianId,
  initialMode = 'before'
}: PhotoDocumentationModalProps) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const chevronColor = isDark ? '#C9C3BA' : '#76706A';

  const [captureType, setCaptureType] = useState<CaptureType>(initialMode);
  // Keys, not category objects: categories are rebuilt whenever the profile row re-emits.
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [showUncategorized, setShowUncategorized] = useState(false);
  const [importTarget, setImportTarget] = useState<{ preset: CaptureTarget | null } | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CaptureTarget | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const profile = useEquipmentProfile(serviceJobId);
  const categories = useMemo(() => buildDocumentationCategories(profile), [profile]);
  const categoryKeys = useMemo(() => categories.map((category) => category.key), [categories]);
  const { data: photos = [] } = useSchedulePhotos(scheduleId);
  const counts = useSchedulePhotoCounts(photos);

  const ctx: PhotoJobContext = useMemo(
    () => ({ scheduleId, technicianId, jobTitle, scheduledStartAtUtc, timeZone }),
    [scheduleId, technicianId, jobTitle, scheduledStartAtUtc, timeZone]
  );

  const selectedIndex = selectedCategoryKey ? categoryKeys.indexOf(selectedCategoryKey) : -1;
  const selectedCategory = selectedIndex >= 0 ? categories[selectedIndex] : null;
  const uncategorizedCount = counts.get('before', null) + counts.get('after', null);
  const detailKey = selectedCategory ? selectedCategory.key : showUncategorized ? null : undefined;

  const handleClose = () => {
    setSelectedCategoryKey(null);
    setShowUncategorized(false);
    onClose();
  };

  const showList = () => {
    setSelectedCategoryKey(null);
    setShowUncategorized(false);
  };

  const stepCategory = (dir: 1 | -1) => {
    const next = getAdjacentCategoryKey(categoryKeys, selectedCategoryKey, dir);
    return next ? () => setSelectedCategoryKey(next) : null;
  };

  // From the list, aim the camera at the first equipment still missing this side.
  const openHeaderCamera = () => {
    const missing = categories.find((category) => counts.get(captureType, category.key) === 0);
    setCameraTarget({ type: captureType, categoryKey: (missing ?? categories[0])?.key ?? null });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={detailKey !== undefined ? showList : handleClose}
      presentationStyle='fullScreen'
      animationType='slide'
    >
      <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
        {detailKey !== undefined ? (
          <EquipmentPhotoScreen
            key={detailKey ?? 'uncategorized'}
            title={selectedCategory?.label ?? 'Uncategorized'}
            jobTitle={jobTitle}
            position={selectedCategory ? { index: selectedIndex, total: categories.length } : null}
            beforePhotos={selectCategoryPhotos(photos, 'before', detailKey)}
            afterPhotos={selectCategoryPhotos(photos, 'after', detailKey)}
            onBack={showList}
            onClose={handleClose}
            onPrev={selectedCategory ? stepCategory(-1) : null}
            onNext={selectedCategory ? stepCategory(1) : null}
            onCamera={(type) => setCameraTarget({ type, categoryKey: detailKey })}
            onGallery={(type) => setImportTarget({ preset: { type, categoryKey: detailKey } })}
            onCompare={() => setShowCompare(true)}
          />
        ) : (
          <>
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

              <View className='mt-3 flex-row rounded-xl bg-[#F0EDE6] p-1 dark:bg-[#16140F]'>
                {(['before', 'after'] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setCaptureType(type)}
                    className={`flex-1 rounded-lg py-2.5 ${captureType === type ? 'bg-white dark:bg-[#2A261D]' : ''}`}
                  >
                    <Text
                      className={`text-center text-sm font-bold ${
                        captureType === type
                          ? 'text-[#14110F] dark:text-white'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {captureTypeLabel(type)} · {counts.total(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className='mt-3 flex-row gap-3'>
                <Pressable
                  onPress={openHeaderCamera}
                  className='min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#14110F] active:opacity-80 dark:bg-white'
                >
                  <Ionicons name='camera' size={20} color={isDark ? '#14110F' : '#FFFFFF'} />
                  <Text className='text-base font-bold text-white dark:text-[#14110F]'>Camera</Text>
                </Pressable>
                <Pressable
                  onPress={() => setImportTarget({ preset: null })}
                  className='min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 active:bg-blue-700'
                >
                  <Ionicons name='images' size={20} color='#FFFFFF' />
                  <Text className='text-base font-bold text-white'>Import from Photos</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView className='flex-1' contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
              <View className='px-4 pt-4'>
                {profile && (
                  <View className='mb-3 flex-row items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-950/40'>
                    <Ionicons name='construct-outline' size={16} color='#2563EB' />
                    <Text className='flex-1 text-xs font-medium text-blue-800 dark:text-blue-200'>
                      Categories from equipment profile
                    </Text>
                  </View>
                )}

                <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                  Current Visit By Equipment
                </Text>
                <View className='gap-3'>
                  {categories.map((category) => {
                    const color = categoryTone(category.kind);
                    return (
                      <Pressable
                        key={category.key}
                        onPress={() => setSelectedCategoryKey(category.key)}
                        className='rounded-2xl border border-black/10 bg-white p-4 active:bg-gray-50 dark:border-white/10 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
                      >
                        <View className='flex-row items-center gap-3'>
                          <View
                            className='h-12 w-12 items-center justify-center rounded-xl'
                            style={{ backgroundColor: `${color}22` }}
                          >
                            <Ionicons name={getCategoryIcon(category.kind) as any} size={24} color={color} />
                          </View>
                          <View className='flex-1 gap-1.5'>
                            <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                              {category.label}
                            </Text>
                            <View className='flex-row gap-2'>
                              <CountPill type='before' count={counts.get('before', category.key)} />
                              <CountPill type='after' count={counts.get('after', category.key)} />
                            </View>
                          </View>
                          <Ionicons name='chevron-forward' size={18} color={chevronColor} />
                        </View>
                      </Pressable>
                    );
                  })}

                  {uncategorizedCount > 0 && (
                    <Pressable
                      onPress={() => setShowUncategorized(true)}
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
                            B {counts.get('before', null)} · A {counts.get('after', null)}
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
                  <JobPhotoHistory scheduleId={scheduleId} serviceJobId={serviceJobId} jobTitle={jobTitle} />
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>

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

      {showCompare && detailKey !== undefined && (
        <BeforeAfterCompare
          visible
          onClose={() => setShowCompare(false)}
          title={selectedCategory?.label ?? 'Uncategorized'}
          beforePhotos={selectCategoryPhotos(photos, 'before', detailKey)}
          afterPhotos={selectCategoryPhotos(photos, 'after', detailKey)}
        />
      )}

      {importTarget && (
        <VisitPhotoImport
          visible
          onClose={() => setImportTarget(null)}
          ctx={ctx}
          categories={categories}
          defaultType={importTarget.preset?.type ?? captureType}
          presetTarget={importTarget.preset}
          visitPhotos={photos}
        />
      )}

      <ToastViewport />
    </Modal>
  );
}
