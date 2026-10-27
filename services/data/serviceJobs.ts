import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';

/** Saved cleaning frequency for a service job, or null when unset / not synced. */
export function useServiceJobFrequency(serviceJobId: string | null | undefined): number | null {
  const { data: rows = [] } = useQuery<{ frequencyPerYear: number | null }>(
    serviceJobId
      ? `SELECT frequencyPerYear FROM servicejobs WHERE id = ? LIMIT 1`
      : `SELECT frequencyPerYear FROM servicejobs WHERE 0`,
    [serviceJobId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  return rows[0]?.frequencyPerYear ?? null;
}
