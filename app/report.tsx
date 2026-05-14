import { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
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
import type { InvoiceType, Schedule } from '@/types';
import type {
  DeficiencyKey,
  InspectionItemKey,
  InspectionItems,
  ReportDeficiencies,
  ReportSavePayload,
  ReportStatus,
  TriState
} from '@/types/report';
import { ReasonChipRow } from '@/components/forms/ReasonChipRow';
import { getScheduleStartAtUtc } from '@/utils/scheduleTime';
import { invoiceLinksToSchedule } from '@/utils/invoices';
import { formatVancouverDateAsUtcDateOnly } from '@/utils/date';

type ReportFormValues = {
  inspectionItems: InspectionItems;
  greaseLevel: number;
  deficiencyTags: DeficiencyKey[];
  deficiencyNotes: string;
  recommendedCleaningFrequency?: number;
  recommendations?: string;
};

const TRI_OPTIONS: TriState[] = ['Yes', 'No', 'N/A'];

const INSPECTION_ITEM_OPTIONS: ReadonlyArray<{
  key: InspectionItemKey;
  label: string;
}> = [
  { key: 'hoodInteriorCleaned', label: 'Hood interior cleaned' },
  { key: 'plenumCleaned', label: 'Plenum cleaned' },
  { key: 'filtersCleanedScope', label: 'Filters cleaned in scope' },
  { key: 'ductCleaned', label: 'Duct cleaned' },
  { key: 'adequateAccessPanels', label: 'Access panels adequate' },
  { key: 'exhaustFanCleaned', label: 'Exhaust fan cleaned' },
  { key: 'fireSuppressionNozzlesClear', label: 'Fire suppression nozzles clear' }
];

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1x per year' },
  { value: 2, label: '2x per year' },
  { value: 3, label: '3x per year' },
  { value: 4, label: '4x per year' }
];

const DEFICIENCY_OPTIONS: ReadonlyArray<{ value: DeficiencyKey; label: string }> = [
  { value: 'filtersRequireReplacement', label: 'Filters require replacement' },
  { value: 'missingFilters', label: 'Missing filters' },
  { value: 'accessPanelsMissingOrInadequate', label: 'Access panels missing/inadequate' },
  { value: 'fireSuppressionNozzlesObstructed', label: 'Nozzles obstructed' },
  { value: 'inaccessibleDuctOrArea', label: 'Inaccessible duct/area' },
  { value: 'exhaustFanNotAccessible', label: 'Fan not accessible' },
  { value: 'exhaustFanNotOperatingOrAbnormal', label: 'Fan not operating/abnormal' },
  { value: 'fanVibrationOrMotorConcern', label: 'Fan vibration/motor concern' },
  { value: 'hingesOrChainsMissing', label: 'Hinges/chains missing' },
  { value: 'roofGreaseContainmentIssue', label: 'Roof grease containment issue' },
  { value: 'ecologyUnitServiceRequired', label: 'Ecology unit service required' },
  { value: 'other', label: 'Other' }
];

const emptyInspectionItems = (): InspectionItems =>
  INSPECTION_ITEM_OPTIONS.reduce((items, option) => {
    items[option.key] = 'N/A';
    return items;
  }, {} as InspectionItems);

function mapBooleanToTriState(value: boolean | number | string | null | undefined): TriState {
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  if (value === 'Yes' || value === 'No' || value === 'N/A') return value;
  return 'N/A';
}

function normalizeInspectionItems(items: Partial<Record<InspectionItemKey, TriState>>): InspectionItems {
  const normalized = emptyInspectionItems();
  for (const option of INSPECTION_ITEM_OPTIONS) {
    normalized[option.key] = items[option.key] ?? 'N/A';
  }
  return normalized;
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

function parseJsonObject<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

type ReportRow = {
  id: string;
  scheduleId: string;
  reportStatus: string | null;
  jobTitle: string | null;
  location: string | null;
  recommendedCleaningFrequency: number | null;
  comments: string | null;
  recommendations: string | null;
  greaseLevel: number | null;
  deficiencies: string | null;
  cleaningDetails: string | null;
  inspectionItems: string | null;
  equipmentDetails: string | null;
};

type ReportScreenParams = {
  scheduleId?: string;
  jobTitle?: string;
  scheduledStartAtUtc?: string;
  startDateTime?: string;
  timeZone?: string;
  technicianId?: string;
};

interface ReportCloseoutContentProps {
  params: ReportScreenParams;
  onClose: () => void;
  showStackHeader?: boolean;
}

export default function ReportScreen() {
  const params = useLocalSearchParams<ReportScreenParams>();

  return (
    <ReportCloseoutContent
      params={params}
      onClose={() => router.back()}
      showStackHeader
    />
  );
}

export function ReportCloseoutContent({
  params,
  onClose,
  showStackHeader = false
}: ReportCloseoutContentProps) {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const insets = useSafeAreaInsets();

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

  const invoiceQuery = useQuery<InvoiceType>(
    scheduleId ? `SELECT * FROM invoices WHERE visitIds LIKE ?` : `SELECT * FROM invoices WHERE 0`,
    [`%${scheduleId}%`],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const linkedInvoice =
    invoiceQuery.data?.find((candidate) => invoiceLinksToSchedule(candidate, scheduleId)) ?? null;

  const { data: existingReports = [] } = useQuery<ReportRow>(
    scheduleId
      ? `SELECT * FROM reports WHERE scheduleId = ? LIMIT 1`
      : `SELECT * FROM reports WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const existingReport = existingReports[0] ?? null;

  const invoiceId = linkedInvoice?.id || '';
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
        inspectionItems: emptyInspectionItems(),
        greaseLevel: 3,
        deficiencyTags: [],
        deficiencyNotes: '',
        recommendedCleaningFrequency: undefined,
        recommendations: ''
      };
    }

    const inspectionData = parseJsonObject<Partial<InspectionItems>>(
      report.inspectionItems,
      {}
    );
    const cleaningData = parseJsonObject<Record<string, boolean | number | string | null>>(
      report.cleaningDetails,
      {}
    );
    const deficiencies = parseJsonObject<ReportDeficiencies>(report.deficiencies, {
      tags: [],
      notes: ''
    });

    const inspectionItems = normalizeInspectionItems({
      ...inspectionData,
      hoodInteriorCleaned:
        inspectionData.hoodInteriorCleaned ?? mapBooleanToTriState(cleaningData.hoodCleaned),
      filtersCleanedScope:
        inspectionData.filtersCleanedScope ?? mapBooleanToTriState(cleaningData.filtersCleaned),
      ductCleaned:
        inspectionData.ductCleaned ?? mapBooleanToTriState(cleaningData.ductworkCleaned),
      exhaustFanCleaned:
        inspectionData.exhaustFanCleaned ?? mapBooleanToTriState(cleaningData.fanCleaned)
    });

    return {
      inspectionItems,
      greaseLevel: report.greaseLevel ?? 3,
      deficiencyTags: deficiencies.tags ?? [],
      deficiencyNotes: deficiencies.notes ?? '',
      recommendedCleaningFrequency: report.recommendedCleaningFrequency ?? undefined,
      recommendations: report.recommendations ?? report.comments ?? ''
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
  const requiresDeficiencyNotes = useMemo(() => {
    const inspectionItems = watchedValues?.inspectionItems;
    if (!inspectionItems) return false;

    return (
      Object.values(inspectionItems).some((value) => value === 'No') ||
      (watchedValues?.deficiencyTags?.length ?? 0) > 0
    );
  }, [watchedValues?.deficiencyTags?.length, watchedValues?.inspectionItems]);

  const buildPayload = (
    status: Exclude<ReportStatus, 'completed'>,
    dateCompleted: string
  ): ReportSavePayload => {
    const values = getValues();
    const deficiencyNotes = values.deficiencyNotes?.trim() || undefined;
    const deficiencies =
      values.deficiencyTags.length > 0 || deficiencyNotes
        ? {
            tags: values.deficiencyTags,
            notes: deficiencyNotes
          }
        : undefined;

    return {
      scheduleId,
      invoiceId: invoiceId || undefined,
      technicianId,
      dateCompleted,
      reportStatus: status === 'draft' ? 'draft' : 'in_progress',
      jobTitle,
      location,
      inspectionItems: normalizeInspectionItems(values.inspectionItems),
      recommendedCleaningFrequency: values.recommendedCleaningFrequency,
      recommendations: values.recommendations?.trim() || undefined,
      greaseLevel: values.greaseLevel,
      deficiencies
    };
  };

  const validateForSubmit = () => {
    const values = getValues();
    clearErrors(['deficiencyNotes']);

    let valid = true;

    if (!scheduleId || !technicianId || !jobTitle || !location) {
      setSubmitError('Missing schedule, technician, job title, or location details.');
      valid = false;
    } else {
      setSubmitError(null);
    }

    if (requiresDeficiencyNotes && !values.deficiencyNotes?.trim()) {
      setError('deficiencyNotes', {
        type: 'required',
        message: 'Add notes for No inspection items or selected deficiencies.'
      });
      valid = false;
    }

    return valid;
  };

  const handleSave = async (status: Exclude<ReportStatus, 'completed'>) => {
    if (status === 'in_progress' && !validateForSubmit()) return;
    if (status === 'draft') {
      setSubmitError(null);
    }

    setIsSaving(true);
    try {
      const completedAt = new Date();
      const payload = buildPayload(status, formatVancouverDateAsUtcDateOnly(completedAt));
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
                    recommendedCleaningFrequency,
                    inspectionItems,
                    greaseLevel,
                    deficiencies,
                    recommendations
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            payload.scheduleId,
            invoiceId || null,
            payload.technicianId,
            payload.dateCompleted,
            payload.reportStatus,
            payload.jobTitle,
            payload.location,
            payload.recommendedCleaningFrequency ?? null,
            JSON.stringify(payload.inspectionItems),
            payload.greaseLevel ?? null,
            payload.deficiencies ? JSON.stringify(payload.deficiencies) : null,
            payload.recommendations ?? null
          ]
        );

        if (status === 'in_progress' && actualServiceDurationMinutes !== null) {
          await tx.execute(
            `UPDATE schedules
             SET actualServiceDurationMinutes = ?
             WHERE id = ?
             AND actualServiceDurationMinutes IS NULL`,
            [actualServiceDurationMinutes, scheduleId]
          );
        }
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save report');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' edges={['bottom', 'left', 'right']}>
      {showStackHeader && (
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Report Closeout',
            headerBackTitle: 'Back'
          }}
        />
      )}
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
          <Text className='text-xl font-semibold text-gray-900 dark:text-white'>Inspection Checklist</Text>
          <View className='mt-4 gap-4'>
            {INSPECTION_ITEM_OPTIONS.map((item) => (
              <Controller
                key={item.key}
                control={control}
                name={`inspectionItems.${item.key}`}
                render={({ field: { onChange, value } }) => (
                  <TriStateRow label={item.label} value={value} onChange={onChange} />
                )}
              />
            ))}
          </View>

          <View className='mt-8'>
            <Text className='text-xl font-semibold text-gray-900 dark:text-white'>Grease Level</Text>
            <Text className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              1 is light, 5 is heavy buildup
            </Text>
            <Controller
              control={control}
              name='greaseLevel'
              render={({ field: { onChange, value } }) => (
                <GreaseLevelSelector value={value} onChange={onChange} />
              )}
            />
          </View>

          <View className='mt-8'>
            <Text className='text-xl font-semibold text-gray-900 dark:text-white'>Deficiencies</Text>
            <Controller
              control={control}
              name='deficiencyTags'
              render={({ field: { onChange, value } }) => (
                <DeficiencyTagSelector value={value} onChange={onChange} />
              )}
            />
            <Controller
              control={control}
              name='deficiencyNotes'
              render={({ field: { onChange, value }, fieldState }) => (
                <>
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={
                      requiresDeficiencyNotes
                        ? 'Required notes for No inspection items or selected deficiencies'
                        : 'Deficiency notes'
                    }
                    className={cn(
                      'mt-3 min-h-[96px] rounded-xl border border-black/10 bg-white px-3 py-2 text-base text-gray-900 dark:border-white/10 dark:bg-[#16140F] dark:text-white',
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

          <View className='mt-8'>
            <Text className='text-xl font-semibold text-gray-900 dark:text-white'>
              Recommended Cleaning Frequency
            </Text>
            <Controller
              control={control}
              name='recommendedCleaningFrequency'
              render={({ field: { onChange, value } }) => (
                <View className='mt-3'>
                  <ReasonChipRow<number>
                    options={FREQUENCY_OPTIONS}
                    value={value}
                    onChange={onChange}
                  />
                </View>
              )}
            />
          </View>

          {submitError && <Text className='mt-6 text-sm text-red-600'>{submitError}</Text>}
        </ScrollView>

        <View
          className='flex-row gap-3 border-t border-black/10 bg-[#F7F5F1] px-5 pt-3 dark:border-white/10 dark:bg-gray-950'
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
    <View className='rounded-2xl border border-black/10 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#16140F]'>
      <Text className='text-base font-semibold text-gray-900 dark:text-white'>{label}</Text>
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
                !isSelected && 'border-black/10 bg-[#F0EDE6] dark:border-white/10 dark:bg-[#1F1C16]'
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  isSelected && (isYes || isNo) && 'text-white',
                  isSelected && isNA && 'text-gray-800',
                  !isSelected && 'text-gray-900 dark:text-white'
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

function GreaseLevelSelector({
  value,
  onChange
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className='mt-4 rounded-2xl border border-black/10 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#16140F]'>
      <View className='flex-row flex-wrap gap-2'>
        {Array.from({ length: 5 }, (_, index) => {
          const levelValue = index + 1;
          const isSelected = levelValue === value;
          return (
            <Pressable
              key={levelValue}
              onPress={() => onChange(levelValue)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-md border',
                isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-black/10 bg-[#F0EDE6] dark:border-white/10 dark:bg-[#1F1C16]'
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-white' : 'text-gray-900 dark:text-white'
                )}
              >
                {levelValue}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DeficiencyTagSelector({
  value,
  onChange
}: {
  value: DeficiencyKey[];
  onChange: (value: DeficiencyKey[]) => void;
}) {
  const toggleTag = (tag: DeficiencyKey) => {
    onChange(value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag]);
  };

  return (
    <View className='mt-3 flex-row flex-wrap gap-2'>
      {DEFICIENCY_OPTIONS.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => toggleTag(option.value)}
            className={cn(
              'min-h-[40px] rounded-full border px-4 py-2',
              isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-black/10 bg-white dark:border-white/10 dark:bg-[#16140F]'
            )}
          >
            <Text className={cn('text-sm font-semibold', isSelected ? 'text-white' : 'text-gray-900 dark:text-white')}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
