import type { InvoiceType } from '@/types';

export function canMarkChequeReceived(invoice?: Pick<InvoiceType, 'status'> | null) {
  return invoice?.status !== 'paid';
}
