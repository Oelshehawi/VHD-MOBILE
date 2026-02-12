import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useQuery, usePowerSync, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import { useUser } from '@clerk/clerk-expo';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Schedule } from '@/types';
import type { ReportSavePayload, TriState } from '@/types/report';

type ReportFormValues = {
  cleaningDetails: {
    hoodCleaned: TriState;
    filtersCleaned: TriState;
    ductworkCleaned: TriState;
    fanCleaned: TriState;
  };
  accessPanels: TriState;
  dirtyScale: number;
  recommendedCleaningFrequency?: number;
  comments?: string;
};

const TRI_OPTIONS: TriState[] = ['Yes', 'No', 'N/A'];

const FREQUENCY_OPTIONS = [
  { value: 1, label: '1x per year' },
  { value: 2, label: '2x per year' },
  { value: 3, label: '3x per year' },
  { value: 4, label: '4x per year' }
];

function getCookingVolume(value: number) {
  if (value <= 3) return 'Low';
  if (value <= 6) return 'Medium';
  return 'High';
}

function mapTriStateToBoolean(value: TriState) {
  if (value === 'Yes') return true;
  if (value === 'No') return false;
  return null;
}

function mapBooleanToTriState(value: boolean | number | string | null): TriState {
  // Handle all possible formats: boolean, number, or string
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return 'N/A';
}

function mapCookingVolumeToScale(volume: string | null): number {
  if (volume === 'Low') return 2;
  if (volume === 'Medium') return 5;
  if (volume === 'High') return 8;
  return 5;
}

function calculateActualServiceDurationMinutes(
  startDateTime: string | undefined,
  completedAt: Date
): number | null {
  if (!startDateTime) return null;

  // DB stores "fake-UTC" timestamps: wall-clock local time serialized with a UTC suffix.
  // Example: "2026-02-11T10:00:00Z" means 10:00 local, not 10:00 UTC.
  const parsedStart = new Date(startDateTime);
  if (!Number.isFinite(parsedStart.getTime())) return null;

  const hasTimezoneSuffix =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(startDateTime) || /GMT/i.test(startDateTime);

  const normalizedStart = hasTimezoneSuffix
    ? new Date(
        parsedStart.getUTCFullYear(),
        parsedStart.getUTCMonth(),
        parsedStart.getUTCDate(),
        parsedStart.getUTCHours(),
        parsedStart.getUTCMinutes(),
        parsedStart.getUTCSeconds(),
        parsedStart.getUTCMilliseconds()
      )
    : parsedStart;

  const startMs = normalizedStart.getTime();
  if (!Number.isFinite(startMs)) return null;

  const elapsedMs = completedAt.getTime() - startMs;
  const elapsedMinutes = Math.round(elapsedMs / (1000 * 60));
  return Math.max(0, elapsedMinutes);
}

type ReportRow = {
  id: string;
  scheduleId: string;
  reportStatus: string | null;
  jobTitle: string | null;
  location: string | null;
  cookingVolume: string | null;
  recommendedCleaningFrequency: number | null;
  comments: string | null;
  cleaningDetails: string | null; // JSON: { hoodCleaned, filtersCleaned, ductworkCleaned, fanCleaned }
  inspectionItems: string | null; // JSON: { adequateAccessPanels }
};

export default function ReportScreen() {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    scheduleId?: string;
    jobTitle?: string;
    startDateTime?: string;
    technicianId?: string;
  }>();

  const scheduleId = typeof params.scheduleId === 'string' ? params.scheduleId : '';
  const technicianId =
    typeof params.technicianId === 'string' ? params.technicianId : user?.id || '';

  const scheduleQuery = useQuery<Schedule>(
    scheduleId ? `SELECT * FROM schedules WHERE id = ?` : `SELECT * FROM schedules WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const schedule = (scheduleQuery.data?.[0] as Schedule | undefined) ?? null;

  const { data: existingReports = [], isLoading: isLoadingReport } = useQuery<ReportRow>(
    scheduleId
      ? `SELECT * FROM reports WHERE scheduleId = ? LIMIT 1`
      : `SELECT * FROM reports WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const existingReport = existingReports[0] ?? null;

  const invoiceId = schedule?.invoiceRef || '';
  const jobTitle =
    schedule?.jobTitle || (typeof params.jobTitle === 'string' ? params.jobTitle : '');
  const location = schedule?.location || '';
  const fallbackStartDateTime =
    typeof params.startDateTime === 'string' ? params.startDateTime : '';

  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const getDefaultValues = (report: ReportRow | null): ReportFormValues => {
    if (!report) {
      return {
        cleaningDetails: {
          hoodCleaned: 'N/A',
          filtersCleaned: 'N/A',
          ductworkCleaned: 'N/A',
          fanCleaned: 'N/A'
        },
        accessPanels: 'N/A',
        dirtyScale: 5,
        recommendedCleaningFrequency: undefined,
        comments: ''
      };
    }

    // Parse cleaningDetails JSON
    let cleaningData: {
      hoodCleaned?: boolean;
      filtersCleaned?: boolean;
      ductworkCleaned?: boolean;
      fanCleaned?: boolean;
    } = {};
    if (report.cleaningDetails) {
      try {
        cleaningData = JSON.parse(report.cleaningDetails);
      } catch {
        console.warn('[Report] Failed to parse cleaningDetails JSON');
      }
    }

    // Parse inspectionItems JSON
    let inspectionData: { adequateAccessPanels?: string } = {};
    if (report.inspectionItems) {
      try {
        inspectionData = JSON.parse(report.inspectionItems);
      } catch {
        console.warn('[Report] Failed to parse inspectionItems JSON');
      }
    }

    return {
      cleaningDetails: {
        hoodCleaned: mapBooleanToTriState(cleaningData.hoodCleaned ?? null),
        filtersCleaned: mapBooleanToTriState(cleaningData.filtersCleaned ?? null),
        ductworkCleaned: mapBooleanToTriState(cleaningData.ductworkCleaned ?? null),
        fanCleaned: mapBooleanToTriState(cleaningData.fanCleaned ?? null)
      },
      accessPanels: (inspectionData.adequateAccessPanels as TriState) ?? 'N/A',
      dirtyScale: mapCookingVolumeToScale(report.cookingVolume),
      recommendedCleaningFrequency: report.recommendedCleaningFrequency ?? undefined,
      comments: report.comments ?? ''
    };
  };

  const { control, handleSubmit, setError, clearErrors, getValues, reset } =
    useForm<ReportFormValues>({
      defaultValues: getDefaultValues(null)
    });

  useEffect(() => {
    if (existingReport) {
      console.log('[Report] Loaded existing report:', JSON.stringify(existingReport, null, 2));
      reset(getDefaultValues(existingReport));
    }
  }, [existingReport, reset]);

  const watchedValues = useWatch({ control });
  const anyNoSelected = useMemo(() => {
    const values = [
      watchedValues?.cleaningDetails?.hoodCleaned,
      watchedValues?.cleaningDetails?.filtersCleaned,
      watchedValues?.cleaningDetails?.ductworkCleaned,
      watchedValues?.cleaningDetails?.fanCleaned,
      watchedValues?.accessPanels
    ];
    return values.some((value) => value === 'No');
  }, [watchedValues]);

  const cookingVolumeLabel = useMemo(
    () => getCookingVolume(watchedValues?.dirtyScale || 1),
    [watchedValues?.dirtyScale]
  );

  const buildPayload = (
    status: ReportSavePayload['reportStatus'],
    dateCompleted: string
  ): ReportSavePayload => {
    const values = getValues();
    return {
      scheduleId,
      invoiceId,
      technicianId,
      dateCompleted,
      reportStatus: status,
      jobTitle,
      location,
      cookingVolume: getCookingVolume(values.dirtyScale),
      recommendedCleaningFrequency: values.recommendedCleaningFrequency,
      comments: values.comments?.trim() || undefined,
      cleaningDetails: {
        hoodCleaned: mapTriStateToBoolean(values.cleaningDetails.hoodCleaned),
        filtersCleaned: mapTriStateToBoolean(values.cleaningDetails.filtersCleaned),
        ductworkCleaned: mapTriStateToBoolean(values.cleaningDetails.ductworkCleaned),
        fanCleaned: mapTriStateToBoolean(values.cleaningDetails.fanCleaned)
      },
      inspectionItems: {
        adequateAccessPanels: values.accessPanels
      }
    };
  };

  const validateForSubmit = () => {
    let valid = true;
    if (!scheduleId || !invoiceId || !technicianId) {
      setSubmitError('Missing schedule or invoice details.');
      valid = false;
    }
    if (!getValues().recommendedCleaningFrequency) {
      setError('recommendedCleaningFrequency', {
        type: 'required',
        message: 'Select a cleaning frequency.'
      });
      valid = false;
    }
    if (anyNoSelected && !getValues().comments?.trim()) {
      setError('comments', {
        type: 'required',
        message: 'Explain why any item is marked No.'
      });
      valid = false;
    }
    if (valid) {
      clearErrors(['recommendedCleaningFrequency', 'comments']);
      setSubmitError(null);
    }
    return valid;
  };

  const handleSave = async (status: ReportSavePayload['reportStatus']) => {
    if (status === 'in_progress' && !validateForSubmit()) return;
    if (status === 'draft') {
      setSubmitError(null);
    }

    setIsSaving(true);
    try {
      const completedAt = new Date();
      const payload = buildPayload(status, completedAt.toISOString());
      const actualServiceDurationMinutes = calculateActualServiceDurationMinutes(
        schedule?.startDateTime || fallbackStartDateTime,
        completedAt
      );

      const reportId = scheduleId;
      await powerSync.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT OR REPLACE INTO reports (
                    id,
                    scheduleId,
                    invoiceId,
                    technicianId,
                    dateCompleted,
                    reportStatus,
                    jobTitle,
                    location,
                    cookingVolume,
                    recommendedCleaningFrequency,
                    comments,
                    cleaningDetails,
                    inspectionItems
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            payload.scheduleId,
            payload.invoiceId,
            payload.technicianId,
            payload.dateCompleted,
            payload.reportStatus,
            payload.jobTitle ?? null,
            payload.location ?? null,
            payload.cookingVolume,
            payload.recommendedCleaningFrequency ?? null,
            payload.comments ?? null,
            JSON.stringify(payload.cleaningDetails),
            JSON.stringify(payload.inspectionItems)
          ]
        );

        if (
          (status === 'in_progress' || status === 'completed') &&
          actualServiceDurationMinutes !== null
        ) {
          await tx.execute(
            `UPDATE schedules
             SET actualServiceDurationMinutes = ?
             WHERE id = ?
             AND actualServiceDurationMinutes IS NULL`,
            [actualServiceDurationMinutes, scheduleId]
          );
        }
      });
      Alert.alert(
        status === 'draft' ? 'Draft saved' : 'Submitted',
        status === 'draft' ? 'Report draft saved.' : 'Report submitted for admin review.'
      );
      router.back();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save report');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className='flex-1 bg-background' edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Report Essentials',
          headerBackTitle: 'Back'
        }}
      />
      <ScrollView
        className='flex-1 px-5 py-6'
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className='text-xl font-semibold text-foreground'>Cleaning + Access Panels</Text>
        <View className='mt-4 gap-4'>
          <Controller
            control={control}
            name='cleaningDetails.hoodCleaned'
            render={({ field: { onChange, value } }) => (
              <TriStateRow label='Hood Cleaned' value={value} onChange={onChange} />
            )}
          />
          <Controller
            control={control}
            name='cleaningDetails.filtersCleaned'
            render={({ field: { onChange, value } }) => (
              <TriStateRow label='Filters Cleaned' value={value} onChange={onChange} />
            )}
          />
          <Controller
            control={control}
            name='cleaningDetails.ductworkCleaned'
            render={({ field: { onChange, value } }) => (
              <TriStateRow label='Ductwork Cleaned' value={value} onChange={onChange} />
            )}
          />
          <Controller
            control={control}
            name='cleaningDetails.fanCleaned'
            render={({ field: { onChange, value } }) => (
              <TriStateRow label='Fan Cleaned' value={value} onChange={onChange} />
            )}
          />
          <Controller
            control={control}
            name='accessPanels'
            render={({ field: { onChange, value } }) => (
              <TriStateRow label='Access Panels Adequate' value={value} onChange={onChange} />
            )}
          />
        </View>

        {anyNoSelected && (
          <View className='mt-5'>
            <Text className='text-sm font-semibold text-foreground'>
              Required: Explain why any item is No
            </Text>
            <Controller
              control={control}
              name='comments'
              render={({ field: { onChange, value }, fieldState }) => (
                <>
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder='Example: No roof access / fan locked out'
                    className={cn(
                      'mt-2 min-h-[96px] rounded-md border border-border bg-background px-3 py-2 text-base text-foreground',
                      fieldState.error && 'border-red-500'
                    )}
                    multiline
                  />
                  {fieldState.error && (
                    <Text className='mt-1 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </>
              )}
            />
          </View>
        )}

        <View className='mt-8'>
          <Text className='text-xl font-semibold text-foreground'>Dirty Scale</Text>
          <Text className='mt-1 text-sm text-muted-foreground'>
            1 is clean, 10 is heavy build up
          </Text>
          <Controller
            control={control}
            name='dirtyScale'
            render={({ field: { onChange, value } }) => (
              <DirtyScaleSelector value={value} onChange={onChange} />
            )}
          />
          <Text className='mt-2 text-sm text-muted-foreground'>
            Cooking Volume:{' '}
            <Text className='font-semibold text-foreground'>{cookingVolumeLabel}</Text>
          </Text>
        </View>

        <View className='mt-8'>
          <Text className='text-xl font-semibold text-foreground'>
            Recommended Cleaning Frequency
          </Text>
          <Controller
            control={control}
            name='recommendedCleaningFrequency'
            rules={{ required: 'Select a cleaning frequency.' }}
            render={({ field: { onChange, value }, fieldState }) => (
              <>
                <View className='mt-3 flex-row flex-wrap gap-2'>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => onChange(option.value)}
                      className={cn(
                        'rounded-full border px-4 py-2',
                        value === option.value
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-border bg-background'
                      )}
                    >
                      <Text
                        className={cn(
                          'text-sm font-semibold',
                          value === option.value ? 'text-white' : 'text-foreground'
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {fieldState.error && (
                  <Text className='mt-2 text-xs text-red-600'>{fieldState.error.message}</Text>
                )}
              </>
            )}
          />
        </View>

        {submitError && <Text className='mt-6 text-sm text-red-600'>{submitError}</Text>}

        <View className='mt-8 flex-row gap-3'>
          <Button
            variant='outline'
            className='flex-1'
            onPress={() => handleSave('draft')}
            disabled={isSaving}
          >
            <Text>Save Draft</Text>
          </Button>
          <Button
            className='flex-1'
            onPress={handleSubmit(() => handleSave('in_progress'))}
            disabled={isSaving}
          >
            <Text>Submit</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TriStateRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  return (
    <View className='rounded-xl border border-border bg-card px-4 py-4'>
      <Text className='text-base font-semibold text-foreground'>{label}</Text>
      <View className='mt-3 flex-row gap-2'>
        {TRI_OPTIONS.map((option) => {
          const isSelected = option === value;
          const isYes = option === 'Yes';
          const isNo = option === 'No';
          const isNA = option === 'N/A';
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              className={cn(
                'flex-1 items-center justify-center rounded-lg border px-3 py-2',
                isSelected && isYes && 'border-emerald-600 bg-emerald-600',
                isSelected && isNo && 'border-red-600 bg-red-600',
                isSelected && isNA && 'border-gray-300 bg-gray-300',
                !isSelected && 'border-border bg-background'
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  isSelected && (isYes || isNo) && 'text-white',
                  isSelected && isNA && 'text-gray-800',
                  !isSelected && 'text-foreground'
                )}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DirtyScaleSelector({
  value,
  onChange
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className='mt-4 rounded-xl border border-border bg-card px-4 py-4'>
      <View className='flex-row flex-wrap gap-2'>
        {Array.from({ length: 10 }, (_, index) => {
          const scaleValue = index + 1;
          const isSelected = scaleValue === value;
          return (
            <Pressable
              key={scaleValue}
              onPress={() => onChange(scaleValue)}
              className={cn(
                'h-10 w-10 items-center justify-center rounded-md border',
                isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-border bg-background'
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-white' : 'text-foreground'
                )}
              >
                {scaleValue}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
