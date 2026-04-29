import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import type {
  AirMoverEquipment,
  EquipmentFilterGroup,
  EquipmentProfile,
  HoodEquipment
} from '@/types';
import { formatDateShort } from '@/utils/date';

interface EquipmentProfilePanelProps {
  serviceJobId?: string | null;
}

function parseArray<T>(value: T[] | string | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function booleanLike(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function formatFilterGroups(value: EquipmentFilterGroup[] | string | null | undefined): string {
  const filterGroups = parseArray<EquipmentFilterGroup>(value);
  if (filterGroups.length === 0) return 'No filters listed';

  return filterGroups
    .map((group) => `${group.quantity} ${group.type}`)
    .join(', ');
}

function formatAirMoverType(type: string): string {
  if (type === 'exhaustFan') return 'Exhaust fan';
  if (type === 'ecologyUnit') return 'Ecology unit';
  return 'Other';
}

export function EquipmentProfilePanel({ serviceJobId }: EquipmentProfilePanelProps) {
  const { data: profiles = [], isLoading } = useQuery<EquipmentProfile>(
    serviceJobId
      ? `SELECT * FROM equipmentprofiles WHERE serviceJobId = ? LIMIT 1`
      : `SELECT * FROM equipmentprofiles WHERE 0`,
    [serviceJobId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const profile = profiles[0] ?? null;
  const hoods = useMemo(() => parseArray<HoodEquipment>(profile?.hoods), [profile?.hoods]);
  const airMovers = useMemo(
    () => parseArray<AirMoverEquipment>(profile?.airMovers),
    [profile?.airMovers]
  );
  const needsReview = booleanLike(profile?.needsReview);

  return (
    <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
      <View className='flex-row items-start justify-between gap-3'>
        <View className='flex-1'>
          <Text className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Equipment Profile</Text>
          <Text className='text-base font-semibold text-gray-900 dark:text-white'>
            {profile?.scopeLabel || profile?.jobTitle || 'Service equipment'}
          </Text>
          {profile?.updatedAt && (
            <Text className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
              Updated {formatDateShort(profile.updatedAt)}
            </Text>
          )}
        </View>
        {needsReview && (
          <View className='flex-row items-center rounded-full bg-amber-100 px-2 py-1'>
            <Ionicons name='alert-circle' size={14} color='#92400E' />
            <Text className='ml-1 text-xs font-semibold text-amber-800'>Needs review</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className='mt-4 flex-row items-center'>
          <ActivityIndicator size='small' color='#22543D' />
          <Text className='ml-2 text-sm text-gray-600 dark:text-gray-300'>
            Loading equipment profile...
          </Text>
        </View>
      ) : !serviceJobId ? (
        <View className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3'>
          <Text className='text-sm text-amber-800'>
            This visit is missing ServiceJob ownership, so no equipment profile can be matched.
          </Text>
        </View>
      ) : !profile ? (
        <View className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3'>
          <Text className='text-sm text-amber-800'>
            No equipment profile exists for this service job yet.
          </Text>
        </View>
      ) : (
        <View className='mt-4 gap-4'>
          <View>
            <Text className='text-sm font-semibold text-gray-900 dark:text-white'>
              Hoods ({hoods.length})
            </Text>
            <View className='mt-2 gap-2'>
              {hoods.length === 0 ? (
                <Text className='text-sm text-gray-500 dark:text-gray-400'>No hoods listed.</Text>
              ) : (
                hoods.map((hood) => (
                  <View key={hood.id || hood.label} className='rounded-lg bg-white p-3 dark:bg-gray-800'>
                    <Text className='font-medium text-gray-900 dark:text-white'>{hood.label}</Text>
                    <Text className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
                      {formatFilterGroups(hood.filterGroups)}
                    </Text>
                    {hood.notes && (
                      <Text className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                        {hood.notes}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>

          <View>
            <Text className='text-sm font-semibold text-gray-900 dark:text-white'>
              Air Movers ({airMovers.length})
            </Text>
            <View className='mt-2 gap-2'>
              {airMovers.length === 0 ? (
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
                  No air movers listed.
                </Text>
              ) : (
                airMovers.map((airMover) => (
                  <View
                    key={airMover.id || airMover.label}
                    className='rounded-lg bg-white p-3 dark:bg-gray-800'
                  >
                    <View className='flex-row items-start justify-between gap-3'>
                      <View className='flex-1'>
                        <Text className='font-medium text-gray-900 dark:text-white'>
                          {airMover.label}
                        </Text>
                        <Text className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
                          {formatAirMoverType(airMover.type)}
                        </Text>
                      </View>
                      {booleanLike(airMover.filterReplacementNeeded) && (
                        <Text className='text-xs font-semibold text-amber-700'>
                          Filter needed
                        </Text>
                      )}
                    </View>
                    {(airMover.manufacturer || airMover.modelNumber || airMover.serialNumber) && (
                      <Text className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
                        {[airMover.manufacturer, airMover.modelNumber, airMover.serialNumber]
                          .filter(Boolean)
                          .join(' / ')}
                      </Text>
                    )}
                    {airMover.notes && (
                      <Text className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                        {airMover.notes}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
