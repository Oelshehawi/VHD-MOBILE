import { describe, expect, it } from '@jest/globals';

import { canMarkChequeReceived } from './invoicePayment';

describe('canMarkChequeReceived', () => {
  it('returns false for paid invoices', () => {
    expect(canMarkChequeReceived({ status: 'paid' })).toBe(false);
  });

  it('returns true for pending invoices', () => {
    expect(canMarkChequeReceived({ status: 'pending' })).toBe(true);
  });

  it('returns true for overdue invoices', () => {
    expect(canMarkChequeReceived({ status: 'overdue' })).toBe(true);
  });

  it('returns true when invoice or status is missing', () => {
    expect(canMarkChequeReceived(null)).toBe(true);
    expect(canMarkChequeReceived(undefined)).toBe(true);
    expect(canMarkChequeReceived({})).toBe(true);
  });
});
