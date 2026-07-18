import { useCallback, useMemo } from 'react';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import type { FieldStaff } from '@/services/database/schema';

export function useTechnicianDirectory() {
  const { data: technicians = [] } = useQuery<FieldStaff>(
    `SELECT id, name, fieldRole, isActive FROM fieldstaff`,
    [],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const namesByFieldStaffId = useMemo(() => {
    const names = new Map<string, string>();

    technicians.forEach((technician) => {
      const fieldStaffId = technician.id?.trim();
      const name = technician.name?.trim();

      if (fieldStaffId && name) {
        names.set(fieldStaffId, name);
      }
    });

    return names;
  }, [technicians]);

  const resolveTechnicianName = useCallback(
    (fieldStaffId: string) => namesByFieldStaffId.get(fieldStaffId) ?? 'Unknown Technician',
    [namesByFieldStaffId]
  );

  return {
    technicians,
    resolveTechnicianName
  };
}
