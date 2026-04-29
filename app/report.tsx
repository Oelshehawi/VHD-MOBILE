import { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useQuery, usePowerSync, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import { useUser } from '@clerk/clerk-expo';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Schedule } from '@/types';
import type {
  ReportSavePayload,
  TriState,
  FilterType,
  FanAccessReason,
  EquipmentDetails
} from '@/types/report';
import { NumberStepper } from '@/components/forms/NumberStepper';
import { ReasonChipRow } from '@/components/forms/ReasonChipRow';
import { getScheduleStartAtUtc } from '@/utils/scheduleTime';

type ReportFormValues = {
  cleaningDetails: {
    hoodCleaned: TriState;
    filtersCleaned: TriState;
    ductworkCleaned: TriState;
    fanCleaned: TriState;
  };
  equipmentDetails: {
    numberOfHoods: number;
    numberOfFilters: number;
    numberOfFans: number;
    filterTypes: FilterType | '';
    otherFilterType: string;
  };
  accessPanels: TriState;
  safeAccessToFan: TriState;
  fanAccessReason: FanAccessReason | '';
  fanAccessReasonDetail: string;
  dirtyScale: number;
  recommendedCleaningFrequency?: number;
  comments?: string;
};

const TRI_OPTIONS: TriState[] = ['Yes', 'No', 'N/A'];

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1x per year' },
  { value: 2, label: '2x per year' },
  { value: 3, label: '3x per year' },
  { value: 4, label: '4x per year' }
];

const FILTER_TYPE_OPTIONS: ReadonlyArray<{ value: FilterType; label: string }> = [
  { value: 'baffle', label: 'Baffle' },
  { value: 'longDrawer', label: 'Long Drawer' },
  { value: 'singleDrawer', label: 'Single Drawer' },
  { value: 'mesh', label: 'Mesh' },
  { value: 'other', label: 'Other' }
];

const FAN_ACCESS_REASON_OPTIONS: ReadonlyArray<{ value: FanAccessReason; label: string }> = [
  { value: 'accessDenied', label: 'Access denied by owner' },
  { value: 'unsafe', label: 'Unsafe to access' },
  { value: 'noRoofAccess', label: 'No roof access' },
  { value: 'locked', label: 'Fan locked out' },
  { value: 'other', label: 'Other' }
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

function calculateActualServiceDurationMinutes(startAtUtc: string | undefined, completedAt: Date): number | null {
  if (!startAtUtc) return null;

  const parsedStart = new Date(startAtUtc);
  if (!Number.isFinite(parsedStart.getTime())) return null;

  const startMs = parsedStart.getTime();
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
  cleaningDetails: string | null;
  inspectionItems: string | null;
  equipmentDetails: string | null;
};

export default function ReportScreen() {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    scheduleId?: string;
    jobTitle?: string;
    scheduledStartAtUtc?: string;
    startDateTime?: string;
    timeZone?: string;
    technicianId?: string;
  }>();

  const scheduleId = typeof params.scheduleId === 'string' ? params.scheduleId : '';
  const technicianId =
    typeof params.technicianId === 'string' && params.technicianId
      ? params.technicianId
      : user?.id || '';

  const scheduleQuery = useQuery<Schedule>(
    scheduleId ? `SELECT * FROM schedules WHERE id = ?` : `SELECT * FROM schedules WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const schedule = (scheduleQuery.data?.[0] as Schedule | undefined) ?? null;

  const { data: existingReports = [] } = useQuery<ReportRow>(
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
  const fallbackScheduledStartAtUtc =
    typeof params.scheduledStartAtUtc === 'string' && params.scheduledStartAtUtc
      ? params.scheduledStartAtUtc
      : typeof params.startDateTime === 'string'
        ? params.startDateTime
        : '';

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
        equipmentDetails: {
          numberOfHoods: 0,
          numberOfFilters: 0,
          numberOfFans: 0,
          filterTypes: '',
          otherFilterType: ''
        },
        accessPanels: 'N/A',
        safeAccessToFan: 'N/A',
        fanAccessReason: '',
        fanAccessReasonDetail: '',
        dirtyScale: 5,
        recommendedCleaningFrequency: undefined,
        comments: ''
      };
    }

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

    let inspectionData: {
      adequateAccessPanels?: string;
      safeAccessToFan?: string;
      fanAccessReason?: string;
    } = {};
    if (report.inspectionItems) {
      try {
        inspectionData = JSON.parse(report.inspectionItems);
      } catch {
        console.warn('[Report] Failed to parse inspectionItems JSON');
      }
    }

    let equipmentData: EquipmentDetails = {};
    if (report.equipmentDetails) {
      try {
        equipmentData = JSON.parse(report.equipmentDetails);
      } catch {
        console.warn('[Report] Failed to parse equipmentDetails JSON');
      }
    }

    const fanReasonRaw = inspectionData.fanAccessReason ?? '';
    const knownReason = FAN_ACCESS_REASON_OPTIONS.find(
      (o) => o.value === fanReasonRaw
    )?.value;
    const fanAccessReason: FanAccessReason | '' =
      knownReason ?? (fanReasonRaw ? 'other' : '');
    const fanAccessReasonDetail =
      fanAccessReason === 'other' && fanReasonRaw !== 'other' ? fanReasonRaw : '';
    const rawEquipmentFilterType = (equipmentData as { filterTypes?: unknown }).filterTypes;
    const normalizedFilterTypeSource = Array.isArray(rawEquipmentFilterType)
      ? rawEquipmentFilterType.find((entry): entry is string => typeof entry === 'string') ?? ''
      : typeof rawEquipmentFilterType === 'string'
        ? rawEquipmentFilterType
        : '';
    const knownFilterType = FILTER_TYPE_OPTIONS.find(
      (o) => o.value === normalizedFilterTypeSource
    )?.value;
    const filterType: FilterType | '' = knownFilterType ?? (normalizedFilterTypeSource ? 'other' : '');
    const otherFilterType =
      filterType === 'other'
        ? normalizedFilterTypeSource && normalizedFilterTypeSource !== 'other'
          ? normalizedFilterTypeSource
          : equipmentData.otherFilterType ?? ''
        : '';

    return {
      cleaningDetails: {
        hoodCleaned: mapBooleanToTriState(cleaningData.hoodCleaned ?? null),
        filtersCleaned: mapBooleanToTriState(cleaningData.filtersCleaned ?? null),
        ductworkCleaned: mapBooleanToTriState(cleaningData.ductworkCleaned ?? null),
        fanCleaned: mapBooleanToTriState(cleaningData.fanCleaned ?? null)
      },
      equipmentDetails: {
        numberOfHoods: equipmentData.numberOfHoods ?? 0,
        numberOfFilters: equipmentData.numberOfFilters ?? 0,
        numberOfFans: equipmentData.numberOfFans ?? 0,
        filterTypes: filterType,
        otherFilterType
      },
      accessPanels: (inspectionData.adequateAccessPanels as TriState) ?? 'N/A',
      safeAccessToFan: (inspectionData.safeAccessToFan as TriState) ?? 'N/A',
      fanAccessReason,
      fanAccessReasonDetail,
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

  const showFanAccessReasons = watchedValues?.safeAccessToFan === 'No';
  const showOtherFilterInput = watchedValues?.equipmentDetails?.filterTypes === 'other';
  const showOtherFanReasonInput = watchedValues?.fanAccessReason === 'other';

  const buildPayload = (
    status: ReportSavePayload['reportStatus'],
    dateCompleted: string
  ): ReportSavePayload => {
    const values = getValues();
    const filterTypeValue =
      values.equipmentDetails.filterTypes === 'other'
        ? values.equipmentDetails.otherFilterType?.trim() || undefined
        : values.equipmentDetails.filterTypes || undefined;
    const fanReasonValue: string | undefined =
      values.safeAccessToFan === 'No'
        ? values.fanAccessReason === 'other'
          ? values.fanAccessReasonDetail?.trim() || 'other'
          : values.fanAccessReason || undefined
        : undefined;

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
      equipmentDetails: {
        numberOfHoods: values.equipmentDetails.numberOfHoods,
        numberOfFilters: values.equipmentDetails.numberOfFilters,
        numberOfFans:
          values.safeAccessToFan === 'No' ? undefined : values.equipmentDetails.numberOfFans,
        filterTypes: filterTypeValue
      },
      inspectionItems: {
        adequateAccessPanels: values.accessPanels,
        safeAccessToFan: values.safeAccessToFan,
        fanAccessReason: fanReasonValue
      }
    };
  };

  const validateForSubmit = () => {
    const values = getValues();
    const errorFields: Parameters<typeof clearErrors>[0] = [
      'recommendedCleaningFrequency',
      'comments',
      'equipmentDetails.numberOfHoods',
      'equipmentDetails.numberOfFilters',
      'equipmentDetails.numberOfFans',
      'equipmentDetails.filterTypes',
      'equipmentDetails.otherFilterType',
      'fanAccessReason',
      'fanAccessReasonDetail'
    ];
    clearErrors(errorFields);

    let valid = true;

    if (!scheduleId || !invoiceId || !technicianId) {
      setSubmitError('Missing schedule or invoice details.');
      valid = false;
    } else {
      setSubmitError(null);
    }

    if (!values.recommendedCleaningFrequency) {
      setError('recommendedCleaningFrequency', {
        type: 'required',
        message: 'Select a cleaning frequency.'
      });
      valid = false;
    }

    if (!(values.equipmentDetails.numberOfHoods > 0)) {
      setError('equipmentDetails.numberOfHoods', {
        type: 'required',
        message: 'Enter the number of hoods.'
      });
      valid = false;
    }
    if (!(values.equipmentDetails.numberOfFilters > 0)) {
      setError('equipmentDetails.numberOfFilters', {
        type: 'required',
        message: 'Enter the number of filters.'
      });
      valid = false;
    }
    if (values.safeAccessToFan !== 'No' && !(values.equipmentDetails.numberOfFans > 0)) {
      setError('equipmentDetails.numberOfFans', {
        type: 'required',
        message: 'Enter the number of fans.'
      });
      valid = false;
    }

    if (!values.equipmentDetails.filterTypes) {
      setError('equipmentDetails.filterTypes', {
        type: 'required',
        message: 'Select a filter type.'
      });
      valid = false;
    } else if (
      values.equipmentDetails.filterTypes === 'other' &&
      !values.equipmentDetails.otherFilterType?.trim()
    ) {
      setError('equipmentDetails.otherFilterType', {
        type: 'required',
        message: 'Describe the other filter type.'
      });
      valid = false;
    }

    if (values.safeAccessToFan === 'No') {
      if (!values.fanAccessReason) {
        setError('fanAccessReason', {
          type: 'required',
          message: 'Select a reason.'
        });
        valid = false;
      } else if (values.fanAccessReason === 'other' && !values.fanAccessReasonDetail?.trim()) {
        setError('fanAccessReasonDetail', {
          type: 'required',
          message: 'Describe the reason.'
        });
        valid = false;
      }
    }

    if (anyNoSelected && !values.comments?.trim()) {
      setError('comments', {
        type: 'required',
        message: 'Explain why any item is marked No.'
      });
      valid = false;
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
        schedule ? getScheduleStartAtUtc(schedule) : fallbackScheduledStartAtUtc,
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
                    inspectionItems,
                    equipmentDetails
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            JSON.stringify(payload.inspectionItems),
            JSON.stringify(payload.equipmentDetails)
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
      <KeyboardAvoidingView
        className='flex-1'
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          className='flex-1 px-5 py-6'
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps='handled'
        >
          {/* Equipment */}
          <Text className='text-xl font-semibold text-foreground'>Equipment</Text>
          <View className='mt-4 gap-3'>
            <Controller
              control={control}
              name='equipmentDetails.numberOfHoods'
              render={({ field: { onChange, value }, fieldState }) => (
                <View>
                  <NumberStepper label='Hoods' value={value} onChange={onChange} />
                  {fieldState.error && (
                    <Text className='mt-1 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </View>
              )}
            />
            <Controller
              control={control}
              name='equipmentDetails.numberOfFilters'
              render={({ field: { onChange, value }, fieldState }) => (
                <View>
                  <NumberStepper label='Filters' value={value} onChange={onChange} />
                  {fieldState.error && (
                    <Text className='mt-1 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </View>
              )}
            />
            <Controller
              control={control}
              name='equipmentDetails.numberOfFans'
              render={({ field: { onChange, value }, fieldState }) => (
                <View>
                  <NumberStepper label='Fans' value={value} onChange={onChange} />
                  {fieldState.error && (
                    <Text className='mt-1 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </View>
              )}
            />
          </View>

          <View className='mt-5'>
            <Text className='text-base font-semibold text-foreground'>Filter Types</Text>
            <Text className='mt-1 text-xs text-muted-foreground'>Select one option</Text>
            <Controller
              control={control}
              name='equipmentDetails.filterTypes'
              render={({ field: { onChange, value }, fieldState }) => (
                <View className='mt-3'>
                  <ReasonChipRow<FilterType>
                    options={FILTER_TYPE_OPTIONS}
                    value={value || undefined}
                    onChange={onChange}
                  />
                  {fieldState.error && (
                    <Text className='mt-2 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </View>
              )}
            />
            {showOtherFilterInput && (
              <Controller
                control={control}
                name='equipmentDetails.otherFilterType'
                render={({ field: { onChange, value }, fieldState }) => (
                  <>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      placeholder='Describe filter type'
                      className={cn(
                        'mt-3 min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-base text-foreground',
                        fieldState.error && 'border-red-500'
                      )}
                    />
                    {fieldState.error && (
                      <Text className='mt-1 text-xs text-red-600'>{fieldState.error.message}</Text>
                    )}
                  </>
                )}
              />
            )}
          </View>

          {/* Cleaning + Access Panels */}
          <Text className='mt-8 text-xl font-semibold text-foreground'>
            Cleaning + Access Panels
          </Text>
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

          {/* Fan Access */}
          <Text className='mt-8 text-xl font-semibold text-foreground'>Fan Access</Text>
          <View className='mt-4 gap-4'>
            <Controller
              control={control}
              name='safeAccessToFan'
              render={({ field: { onChange, value } }) => (
                <TriStateRow label='Safe Access to Fan' value={value} onChange={onChange} />
              )}
            />
            {showFanAccessReasons && (
              <View className='rounded-xl border border-border bg-card px-4 py-4'>
                <Text className='text-base font-semibold text-foreground'>Reason</Text>
                <Controller
                  control={control}
                  name='fanAccessReason'
                  render={({ field: { onChange, value }, fieldState }) => (
                    <View className='mt-3'>
                      <ReasonChipRow<FanAccessReason>
                        options={FAN_ACCESS_REASON_OPTIONS}
                        value={value || undefined}
                        onChange={onChange}
                      />
                      {fieldState.error && (
                        <Text className='mt-2 text-xs text-red-600'>
                          {fieldState.error.message}
                        </Text>
                      )}
                    </View>
                  )}
                />
                {showOtherFanReasonInput && (
                  <Controller
                    control={control}
                    name='fanAccessReasonDetail'
                    render={({ field: { onChange, value }, fieldState }) => (
                      <>
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          placeholder='Describe reason'
                          className={cn(
                            'mt-3 min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-base text-foreground',
                            fieldState.error && 'border-red-500'
                          )}
                        />
                        {fieldState.error && (
                          <Text className='mt-1 text-xs text-red-600'>
                            {fieldState.error.message}
                          </Text>
                        )}
                      </>
                    )}
                  />
                )}
              </View>
            )}
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
                  <View className='mt-3'>
                    <ReasonChipRow<number>
                      options={FREQUENCY_OPTIONS}
                      value={value}
                      onChange={onChange}
                    />
                  </View>
                  {fieldState.error && (
                    <Text className='mt-2 text-xs text-red-600'>{fieldState.error.message}</Text>
                  )}
                </>
              )}
            />
          </View>

          {submitError && <Text className='mt-6 text-sm text-red-600'>{submitError}</Text>}
        </ScrollView>

        {/* Sticky action bar */}
        <View
          className='flex-row gap-3 border-t border-border bg-background px-5 pt-3'
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
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
      </KeyboardAvoidingView>
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
                'min-h-[44px] flex-1 items-center justify-center rounded-lg border px-3 py-2',
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
                'h-11 w-11 items-center justify-center rounded-md border',
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
