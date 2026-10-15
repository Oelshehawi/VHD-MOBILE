import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import {
  isOptionalCategory,
  type CaptureTarget,
  type CaptureType,
  type DocumentationCategory
} from '@/utils/equipmentCategories';
import {
  buildGridRows,
  buildRowLayout,
  captureTypeLabel,
  clusterByTimeGap,
  formatClusterTime,
  suggestBeforeAfterSplit,
  type GridRow,
  type ImportAssignment,
  type ImportCandidate,
  type ImportStatus
} from '@/utils/photoImport';
import { ImportPhotoTile, type TileBadge } from './ImportPhotoTile';

const COLUMNS = 4;
const HEADER_HEIGHT = 44;

/** Per-photo sort state: a full or partial target, or skipped (not imported). */
type SortEntry = { type?: CaptureType; categoryKey?: string | null } | 'skip';

interface PhotoSortStepProps {
  candidates: readonly ImportCandidate[];
  categories: readonly DocumentationCategory[];
  statuses: ReadonlyMap<string, ImportStatus>;
  defaultType: CaptureType;
  onImport: (assignments: ImportAssignment[]) => void;
  onBack?: () => void;
}

export function statusBadge(status: ImportStatus | undefined): TileBadge | null {
  if (!status) return null;
  switch (status.kind) {
    case 'imported':
      return { label: 'Imported ✓', tone: 'success' };
    case 'possible':
      return { label: 'Maybe imported', tone: 'warning' };
    case 'otherJob':
      return { label: status.jobTitle ? `In ${status.jobTitle}` : 'In other job', tone: 'muted' };
    default:
      return null;
  }
}

function shortLabel(label: string) {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

export function PhotoSortStep({
  candidates,
  categories,
  statuses,
  defaultType,
  onImport,
  onBack
}: PhotoSortStepProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileSize = Math.floor(width / COLUMNS);

  const [activeType, setActiveType] = useState<CaptureType>(defaultType);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [entries, setEntries] = useState<ReadonlyMap<string, SortEntry>>(() => {
    // Photos already on this visit start skipped so they aren't imported twice.
    const initial = new Map<string, SortEntry>();
    for (const candidate of candidates) {
      const kind = statuses.get(candidate.id)?.kind;
      if (kind === 'imported' || kind === 'possible') initial.set(candidate.id, 'skip');
    }
    return initial;
  });

  const clusters = useMemo(() => clusterByTimeGap(candidates), [candidates]);
  const rows = useMemo(() => buildGridRows(clusters, COLUMNS), [clusters]);
  const layout = useMemo(() => buildRowLayout(rows, HEADER_HEIGHT, tileSize), [rows, tileSize]);
  const split = useMemo(() => suggestBeforeAfterSplit(candidates), [candidates]);
  const labelByKey = useMemo(
    () => new Map(categories.map((category) => [category.key, category.label])),
    [categories]
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[]) => {
    setSelected((current) => {
      const allSelected = ids.every((id) => current.has(id));
      const next = new Set(current);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  const assignSelected = (entry: SortEntry) => {
    if (selected.size === 0) return;
    setEntries((current) => {
      const next = new Map(current);
      selected.forEach((id) => next.set(id, entry));
      return next;
    });
    setSelected(new Set());
  };

  const applySplit = () => {
    if (!split) return;
    setEntries((current) => {
      const next = new Map(current);
      const setType = (id: string, type: CaptureType) => {
        const existing = next.get(id);
        if (existing === 'skip') return;
        next.set(id, { ...existing, type });
      };
      split.beforeIds.forEach((id) => setType(id, 'before'));
      split.afterIds.forEach((id) => setType(id, 'after'));
      return next;
    });
  };

  // Photos without equipment land in the always-present Other bucket.
  const otherKey = useMemo(() => categories.find(isOptionalCategory)?.key ?? null, [categories]);

  const { assignments, unsortedCount } = useMemo(() => {
    const result: ImportAssignment[] = [];
    let unsorted = 0;
    for (const candidate of candidates) {
      const entry = entries.get(candidate.id);
      if (entry === 'skip') continue;
      const target: CaptureTarget = {
        type: entry?.type ?? activeType,
        categoryKey: entry?.categoryKey ?? otherKey
      };
      if (!entry?.categoryKey) unsorted += 1;
      result.push({ candidate, target });
    }
    return { assignments: result, unsortedCount: unsorted };
  }, [candidates, entries, activeType, otherKey]);

  const captionFor = (entry: SortEntry | undefined): string | null => {
    if (!entry) return null;
    if (entry === 'skip') return 'Skip';
    const type = entry.type ? captureTypeLabel(entry.type)[0] : null;
    const label = entry.categoryKey ? shortLabel(labelByKey.get(entry.categoryKey) ?? 'Equipment') : null;
    return [type, label].filter(Boolean).join(' · ') || null;
  };

  const renderRow = ({ item }: { item: GridRow<ImportCandidate> }) => {
    if (item.kind === 'header') {
      const ids = item.cluster.items.map((candidate) => candidate.id);
      const allSelected = ids.every((id) => selected.has(id));
      return (
        <Pressable
          onPress={() => toggleMany(ids)}
          style={{ height: HEADER_HEIGHT }}
          className='flex-row items-center justify-between px-3'
        >
          <Text className='text-sm font-semibold text-[#14110F] dark:text-white'>
            {item.cluster.startAt
              ? `${formatClusterTime(item.cluster.startAt)} – ${formatClusterTime(item.cluster.endAt)}`
              : 'Unknown time'}
            <Text className='text-xs font-medium text-gray-500'>  {ids.length} photos</Text>
          </Text>
          <Text className='text-sm font-semibold text-blue-600 dark:text-blue-400'>
            {allSelected ? 'Deselect' : 'Select all'}
          </Text>
        </Pressable>
      );
    }

    return (
      <View className='flex-row' style={{ height: tileSize }}>
        {item.items.map((candidate) => {
          const entry = entries.get(candidate.id);
          return (
            <ImportPhotoTile
              key={candidate.id}
              candidate={candidate}
              size={tileSize}
              selected={selected.has(candidate.id)}
              dimmed={entry === 'skip'}
              badge={statusBadge(statuses.get(candidate.id))}
              caption={captionFor(entry)}
              captionTone={entry && entry !== 'skip' ? entry.type ?? null : null}
              onPress={toggle}
            />
          );
        })}
      </View>
    );
  };

  const chipBase = 'mr-2 min-h-11 flex-row items-center rounded-full border px-4';
  const hasSelection = selected.size > 0;

  return (
    <View className='flex-1'>
      {split && (
        <View className='mx-3 mt-3 flex-row items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-950/40'>
          <Ionicons name='git-branch-outline' size={18} color='#2563EB' />
          <Text className='flex-1 text-xs font-medium text-blue-900 dark:text-blue-100'>
            Longest pause: {formatClusterTime(split.gapStartAt)} – {formatClusterTime(split.gapEndAt)}.
            Mark {split.beforeIds.length} before and {split.afterIds.length} after?
          </Text>
          <Pressable onPress={applySplit} className='rounded-lg bg-blue-600 px-3 py-2 active:bg-blue-700'>
            <Text className='text-xs font-bold text-white'>Split</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        getItemLayout={(_, index) => ({ ...layout[index], index })}
        extraData={{ selected, entries }}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
      />

      <View
        className='border-t border-black/10 bg-white pt-3 dark:border-white/10 dark:bg-[#16140F]'
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className='mb-2 flex-row items-center gap-2 px-3'>
          <View className='flex-row rounded-xl bg-[#F0EDE6] p-1 dark:bg-[#2A261D]'>
            {(['before', 'after'] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setActiveType(type)}
                className={`rounded-lg px-4 py-2 ${
                  activeType === type
                    ? type === 'before'
                      ? 'bg-blue-600'
                      : 'bg-emerald-600'
                    : ''
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    activeType === type ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {captureTypeLabel(type)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className='flex-1 text-xs font-medium text-gray-500' numberOfLines={2}>
            {hasSelection
              ? `${selected.size} selected – tap equipment to assign`
              : 'Select photos, then tap equipment'}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          keyboardShouldPersistTaps='handled'
        >
          {categories.map((category) => (
            <Pressable
              key={category.key}
              disabled={!hasSelection}
              onPress={() => assignSelected({ type: activeType, categoryKey: category.key })}
              className={`${chipBase} border-black/15 bg-white dark:border-white/20 dark:bg-[#1F1C16] ${
                hasSelection ? '' : 'opacity-50'
              }`}
            >
              <Text className='text-sm font-semibold text-[#14110F] dark:text-white'>{category.label}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={!hasSelection}
            onPress={() => assignSelected('skip')}
            className={`${chipBase} border-red-300 dark:border-red-800 ${hasSelection ? '' : 'opacity-50'}`}
          >
            <Ionicons name='remove-circle-outline' size={16} color='#DC2626' />
            <Text className='ml-1 text-sm font-semibold text-red-600'>Skip</Text>
          </Pressable>
        </ScrollView>

        <View className='mt-3 flex-row items-center gap-3 px-3'>
          {onBack && (
            <Pressable
              onPress={onBack}
              className='min-h-12 items-center justify-center rounded-xl border border-black/15 px-4 dark:border-white/20'
            >
              <Text className='text-base font-semibold text-[#14110F] dark:text-white'>Back</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onImport(assignments)}
            disabled={assignments.length === 0}
            className={`min-h-12 flex-1 items-center justify-center rounded-xl ${
              assignments.length === 0 ? 'bg-gray-300 dark:bg-[#2A261D]' : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            <Text className='text-base font-bold text-white'>
              Add {assignments.length} photo{assignments.length === 1 ? '' : 's'}
            </Text>
            {unsortedCount > 0 && (
              <Text className='text-[11px] font-medium text-white/85'>
                {unsortedCount} without equipment → Other
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
