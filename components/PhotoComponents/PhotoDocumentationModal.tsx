import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import type { EquipmentProfile, PhotoCategoryKind } from '@/types';
import {
  buildDocumentationCategories,
  getCategoryIcon,
  type DocumentationCategory
} from '@/utils/equipmentCategories';
import { PhotoCapture } from './PhotoCapture';
import { JobPhotoHistory } from './JobPhotoHistory';

type DocumentationMode = 'before' | 'after';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  serviceJobId?: string | null;
  jobTitle: string;
  scheduledStartAtUtc: string;
  technicianId: string;
  initialMode?: DocumentationMode;
}

interface PhotoCountRow {
  type: DocumentationMode;
  photoCategoryKey: string | null;
  count: number | null;
}

function categoryTone(kind: PhotoCategoryKind) {
  if (kind === 'hood' || kind === 'hoodGroup') return '#D97706';
  if (kind === 'exhaustFan') return '#2563EB';
  if (kind === 'ecologyUnit') return '#059669';
  return '#6B7280';
}

function getCount(
  counts: ReadonlyArray<Readonly<PhotoCountRow>>,
  mode: DocumentationMode,
  categoryKey: string | null
): number {
  return Number(
    counts.find((row) => row.type === mode && row.photoCategoryKey === categoryKey)?.count ?? 0
  );
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  serviceJobId,
  jobTitle,
  scheduledStartAtUtc,
  technicianId,
  initialMode = 'before'
}: PhotoDocumentationModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const chevronColor = isDark ? '#C9C3BA' : '#76706A';
  const [activeMode, setActiveMode] = useState<DocumentationMode>(initialMode);
  const [selectedCategory, setSelectedCategory] = useState<DocumentationCategory | null>(null);
  const [showLegacyCurrentVisit, setShowLegacyCurrentVisit] = useState(false);

  const { data: profiles = [] } = useQuery<EquipmentProfile>(
    serviceJobId
      ? `SELECT * FROM equipmentprofiles WHERE serviceJobId = ? LIMIT 1`
      : `SELECT * FROM equipmentprofiles WHERE 0`,
    [serviceJobId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const profile = profiles[0] ?? null;
  const categories = useMemo(() => buildDocumentationCategories(profile), [profile]);

  const { data: photoCounts = [] } = useQuery<PhotoCountRow>(
    scheduleId
      ? `SELECT type, photoCategoryKey, COUNT(*) as count
           FROM photos
           WHERE scheduleId = ? AND type IN ('before', 'after')
           GROUP BY type, photoCategoryKey`
      : `SELECT NULL as type, NULL as photoCategoryKey, 0 as count WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const totalBefore = useMemo(
    () => photoCounts.reduce((sum, row) => sum + (row.type === 'before' ? Number(row.count ?? 0) : 0), 0),
    [photoCounts]
  );
  const totalAfter = useMemo(
    () => photoCounts.reduce((sum, row) => sum + (row.type === 'after' ? Number(row.count ?? 0) : 0), 0),
    [photoCounts]
  );
  const legacyCurrentVisitCount = getCount(photoCounts, activeMode, null);

  const handleClose = () => {
    setSelectedCategory(null);
    setShowLegacyCurrentVisit(false);
    onClose();
  };

  const headerTitle = selectedCategory
    ? selectedCategory.label
    : showLegacyCurrentVisit
      ? 'Uncategorized'
      : 'Photos';

  if (!visible) return null;

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
            {(selectedCategory || showLegacyCurrentVisit) && (
              <Pressable
                onPress={() => {
                  setSelectedCategory(null);
                  setShowLegacyCurrentVisit(false);
                }}
                className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
              >
                <Ionicons name='chevron-back' size={20} color={iconColor} />
              </Pressable>
            )}
            <View className='flex-1'>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>
                {headerTitle}
              </Text>
              <Text className='mt-1 text-xs font-medium text-gray-500' numberOfLines={1}>
                {activeMode === 'before' ? 'Before' : 'After'} documentation - {jobTitle}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='close' size={22} color={iconColor} />
            </Pressable>
          </View>

          <View className='mt-3 flex-row rounded-xl bg-[#F0EDE6] p-1 dark:bg-[#16140F]'>
            {[
              { key: 'before' as const, label: `Before - ${totalBefore}` },
              { key: 'after' as const, label: `After - ${totalAfter}` }
            ].map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => {
                  setActiveMode(tab.key);
                  setSelectedCategory(null);
                  setShowLegacyCurrentVisit(false);
                }}
                className={`flex-1 rounded-lg py-3 ${activeMode === tab.key ? 'bg-white dark:bg-[#2A261D]' : ''}`}
              >
                <Text
                  className={`text-center text-sm font-bold ${
                    activeMode === tab.key
                      ? 'text-[#14110F] dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {selectedCategory || showLegacyCurrentVisit ? (
          <ScrollView
            className='flex-1 px-4 py-4'
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            <PhotoCapture
              technicianId={technicianId}
              type={activeMode}
              jobTitle={jobTitle}
              scheduledStartAtUtc={scheduledStartAtUtc}
              scheduleId={scheduleId}
              photoCategoryKey={selectedCategory?.key ?? null}
              photoCategoryLabel={selectedCategory?.label ?? 'Uncategorized'}
              photoCategoryKind={selectedCategory?.kind ?? null}
              allowAdd
            />
          </ScrollView>
        ) : (
          <ScrollView
            className='flex-1'
            contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          >
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
                Current Visit By Category
              </Text>
              <View className='gap-3'>
                {categories.map((category) => {
                  const count = getCount(photoCounts, activeMode, category.key);
                  const color = categoryTone(category.kind);

                  return (
                    <Pressable
                      key={category.key}
                      onPress={() => setSelectedCategory(category)}
                      className='rounded-2xl border border-black/10 bg-white p-4 active:bg-gray-50 dark:border-white/10 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
                    >
                      <View className='flex-row items-center gap-3'>
                        <View
                          className='h-12 w-12 items-center justify-center rounded-xl'
                          style={{ backgroundColor: `${color}22` }}
                        >
                          <Ionicons name={getCategoryIcon(category.kind) as any} size={24} color={color} />
                        </View>
                        <View className='flex-1'>
                          <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                            {category.label}
                          </Text>
                          <Text className='mt-1 text-xs font-medium text-gray-500'>
                            {count} {activeMode} photo{count === 1 ? '' : 's'}
                          </Text>
                        </View>
                        <View className='flex-row items-center gap-2'>
                          {count === 0 && (
                            <View className='rounded-full bg-amber-100 px-2 py-1'>
                              <Text className='text-xs font-semibold text-amber-900'>needs photo</Text>
                            </View>
                          )}
                          <Ionicons name='chevron-forward' size={18} color={chevronColor} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}

                {legacyCurrentVisitCount > 0 && (
                  <Pressable
                    onPress={() => setShowLegacyCurrentVisit(true)}
                    className='rounded-2xl border border-dashed border-black/20 bg-white p-4 dark:border-white/20 dark:bg-[#16140F]'
                  >
                    <View className='flex-row items-center gap-3'>
                      <View className='h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-[#2A261D]'>
                        <Ionicons name='images-outline' size={24} color={chevronColor} />
                      </View>
                      <View className='flex-1'>
                        <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                          Uncategorized current-visit photos
                        </Text>
                        <Text className='mt-1 text-xs font-medium text-gray-500'>
                          {legacyCurrentVisitCount} legacy photo{legacyCurrentVisitCount === 1 ? '' : 's'}
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
        )}
      </View>
    </Modal>
  );
}
