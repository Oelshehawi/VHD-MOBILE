import { Linking } from 'react-native';

export interface OnSiteContact {
  name?: string;
  phone?: string;
  email?: string;
}

export function parseOnSiteContact(value: unknown): OnSiteContact | null {
  if (!value) return null;
  if (typeof value === 'object') return value as OnSiteContact;

  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function openPhone(phoneNumber: string) {
  const cleanedNumber = phoneNumber.replace(/[^\d+]/g, '');
  if (!cleanedNumber) return;

  Linking.openURL(`tel:${cleanedNumber}`).catch(() => undefined);
}
