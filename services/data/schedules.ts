import { useQuery } from '@powersync/react-native';
import { Schedule, InvoiceType } from '@/types';

export function useSchedules(
  isManager: boolean,
  userId: string | null | undefined
) {
  return useQuery<Schedule>(
    `SELECT * FROM schedules 
     WHERE (? = true OR assignedTechnicians LIKE ?)
     ORDER BY startDateTime ASC`,
    [isManager, userId ? `%${userId}%` : '']
  );
}

export function useInvoiceById(invoiceId: string | null) {
  return useQuery<InvoiceType>(
    invoiceId
      ? `SELECT * FROM invoices WHERE id = ?`
      : `SELECT * FROM invoices WHERE 0`,
    [invoiceId || '']
  );
}
