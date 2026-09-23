import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { ApiClient } from './ApiClient';

export type InvoiceSendResult = {
  success: boolean;
  outcome?: 'pending' | 'sent' | 'partial' | 'failed' | 'needs_review';
  requestId?: string;
  message?: string;
  error?: string;
  code?: string;
  reviewClosed?: boolean;
  portalLinkStatus?: string;
  portalLinkError?: string;
  recipientResults?: Array<{ originalRecipient: string; recipient: string; status: string; reason?: string }>;
};

// Release the saved ID when a fresh request cannot duplicate a delivery: every
// recipient received it, none did, or Office closed the review. A partial send
// keeps its ID so retrying cannot re-send to recipients who already received it.
function isFinalForRetry(result: InvoiceSendResult): boolean {
  return result.outcome === 'sent' || result.outcome === 'failed' || Boolean(result.reviewClosed);
}

const keyFor = (account: string, schedule: string) => `invoice-send-v2:${account}:${schedule}`;
const inFlight = new Map<string, Promise<InvoiceSendResult>>();

export async function sendInvoiceOnline(account: string, scheduleId: string, technicianId: string): Promise<InvoiceSendResult> {
  if (!account) return { success: false, error: 'Sign in before sending.' };
  const key = keyFor(account, scheduleId);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const operation = sendPersistedInvoice(key, scheduleId, technicianId);
  inFlight.set(key, operation);
  try { return await operation; }
  finally { inFlight.delete(key); }
}

async function sendPersistedInvoice(key: string, scheduleId: string, technicianId: string): Promise<InvoiceSendResult> {
  const requestId = await AsyncStorage.getItem(key) || randomUUID();
  // Persistence must succeed before the first network request.
  await AsyncStorage.setItem(key, requestId);
  const result = await new ApiClient().sendInvoice(scheduleId, technicianId, requestId);
  if (isFinalForRetry(result)) await AsyncStorage.removeItem(key);
  return result;
}

export async function checkInvoiceSend(account: string, scheduleId: string): Promise<InvoiceSendResult | null> {
  const key = keyFor(account, scheduleId);
  const requestId = await AsyncStorage.getItem(key);
  if (!requestId) return null;
  const result = await new ApiClient().getInvoiceSend(requestId);
  if (isFinalForRetry(result)) await AsyncStorage.removeItem(key);
  return result;
}

export function invoiceSendMessage(result: InvoiceSendResult): string {
  const summary = result.message || result.error || 'Unable to confirm the send result.';
  const recipients = (result.recipientResults || []).map(r => `${r.originalRecipient}: ${r.status.replaceAll('_', ' ')}${r.reason ? ` (${r.reason})` : ''}`).join('\n');
  const portal = result.portalLinkStatus === 'failed' ? `Portal link was not included: ${result.portalLinkError || 'unavailable'}` : '';
  return [summary, recipients, portal].filter(Boolean).join('\n');
}
