import { useCallback, useMemo } from 'react';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import type { Technician } from '@/services/database/schema';

export function useTechnicianDirectory() {
  const { data: technicians = [] } = useQuery<Technician>(
    `SELECT id, clerkUserId, name, fieldRole, isActive
     FROM technicians
     WHERE clerkUserId IS NOT NULL`,
    [],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const namesByClerkUserId = useMemo(() => {
    const names = new Map<string, string>();

    technicians.forEach((technician) => {
      const clerkUserId = technician.clerkUserId?.trim();
      const name = technician.name?.trim();

      if (clerkUserId && name) {
        names.set(clerkUserId, name);
      }
    });

    return names;
  }, [technicians]);

  const resolveTechnicianName = useCallback(
    (userId: string) => namesByClerkUserId.get(userId) ?? 'Unknown Technician',
    [namesByClerkUserId]
  );

  return {
    technicians,
    resolveTechnicianName
  };
}
