import { useQuery } from '@powersync/react-native';
import { Schedule, InvoiceType } from '@/types';
import { ASSIGNED_TO_USER_CLAUSE } from './sqlFragments';

export function useSchedules(isManager: boolean, userId: string | null | undefined) {
  return useQuery<Schedule>(
    `SELECT * FROM schedules
     WHERE (? = true OR (${ASSIGNED_TO_USER_CLAUSE}))
     ORDER BY scheduledStartAtUtc ASC`,
    [isManager, userId ?? '']
  );
}

export function useInvoiceById(invoiceId: string | null) {
  return useQuery<InvoiceType>(
    invoiceId ? `SELECT * FROM invoices WHERE id = ?` : `SELECT * FROM invoices WHERE 0`,
    [invoiceId || '']
  );
}
