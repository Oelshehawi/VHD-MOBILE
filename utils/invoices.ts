import type { InvoiceType } from '@/types';

export function parseInvoiceLinkedIds(value: InvoiceType['visitIds']): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    }
  } catch {
    return value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  return [];
}

export function invoiceLinksToSchedule(invoice: InvoiceType, scheduleId: string): boolean {
  return parseInvoiceLinkedIds(invoice.visitIds).includes(scheduleId);
}
