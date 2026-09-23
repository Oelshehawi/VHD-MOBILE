import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InvoiceSendResult } from './invoiceSending';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'stable-request-id') }));
const mockSend = jest.fn<(...args: string[]) => Promise<InvoiceSendResult>>();
const mockCheck = jest.fn<(id: string) => Promise<InvoiceSendResult>>();
jest.mock('./ApiClient', () => ({ ApiClient: class { sendInvoice = mockSend; getInvoiceSend = mockCheck; } }));
import { sendInvoiceOnline, checkInvoiceSend, invoiceSendMessage } from './invoiceSending';

beforeEach(async () => { await AsyncStorage.clear(); mockSend.mockReset(); mockCheck.mockReset(); });
describe('online invoice sending', () => {
  it('joins concurrent taps before asynchronous storage creates a second ID', async () => {
    mockSend.mockResolvedValue({ success: true, outcome: 'sent' });
    await Promise.all([sendInvoiceOnline('account', 'visit', 'tech'), sendInvoiceOnline('account', 'visit', 'tech')]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('persists the ID before sending and reuses it after a lost response', async () => {
    mockSend.mockImplementation(async (...args) => {
      expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).toBe(args[2]);
      return { success: false, outcome: 'needs_review' };
    });
    await sendInvoiceOnline('account', 'visit', 'tech');
    await sendInvoiceOnline('account', 'visit', 'tech');
    expect(mockSend.mock.calls[0]?.[2]).toBe(mockSend.mock.calls[1]?.[2]);
  });
  it('keeps partial results for status recovery instead of claiming complete success', async () => {
    const partial: InvoiceSendResult = { success: true, outcome: 'partial', message: 'Sent to 1 recipient; 1 failed',
      recipientResults: [{ originalRecipient: 'billing@example.test', recipient: 'billing@example.test', status: 'failed' }] };
    mockSend.mockResolvedValue(partial);
    await sendInvoiceOnline('account', 'visit', 'tech');
    mockCheck.mockResolvedValue(partial);
    expect((await checkInvoiceSend('account', 'visit'))?.outcome).toBe('partial');
    expect(invoiceSendMessage(partial)).toContain('billing@example.test: failed');
    expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).not.toBeNull();
  });
  it('clears a completed request and never sends when only checking status', async () => {
    await AsyncStorage.setItem('invoice-send-v2:account:visit', 'request-id');
    mockCheck.mockResolvedValue({ success: true, outcome: 'sent' });
    expect((await checkInvoiceSend('account', 'visit'))?.outcome).toBe('sent');
    expect(mockSend).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).toBeNull();
  });
  it('isolates requests by account and keeps not-received requests available for explicit retry', async () => {
    await AsyncStorage.setItem('invoice-send-v2:account:visit', 'request-id');
    expect(await checkInvoiceSend('different-account', 'visit')).toBeNull();
    mockCheck.mockResolvedValue({ success: false, code: 'NOT_RECEIVED' });
    await checkInvoiceSend('account', 'visit');
    expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).toBe('request-id');
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('releases a definite failure so a retry after fixing it sends a new request', async () => {
    const { randomUUID } = jest.requireMock<{ randomUUID: jest.Mock<() => string> }>('expo-crypto');
    randomUUID.mockReturnValueOnce('first-id').mockReturnValueOnce('second-id');
    mockSend.mockResolvedValueOnce({ success: false, outcome: 'failed',
      recipientResults: [{ originalRecipient: 'billing@example.test', recipient: 'billing@example.test', status: 'failed', reason: 'Inactive recipient' }] });
    await sendInvoiceOnline('account', 'visit', 'tech');
    expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).toBeNull();
    mockSend.mockResolvedValueOnce({ success: true, outcome: 'sent' });
    await sendInvoiceOnline('account', 'visit', 'tech');
    expect(mockSend.mock.calls.map(call => call[2])).toEqual(['first-id', 'second-id']);
  });
  it('clears a failed request after Office closes the review', async () => {
    await AsyncStorage.setItem('invoice-send-v2:account:visit', 'request-id');
    mockCheck.mockResolvedValue({ success: false, outcome: 'failed', reviewClosed: true });
    await checkInvoiceSend('account', 'visit');
    expect(await AsyncStorage.getItem('invoice-send-v2:account:visit')).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
