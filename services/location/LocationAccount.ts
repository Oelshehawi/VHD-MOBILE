import * as SecureStore from 'expo-secure-store';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';
import { getPersistentClerk } from '@/services/background/clerkBootstrap';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';

const KEY = 'vhd_location_owner_v1';
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let suspended = false;
export interface LocationOwner { appUserId: string; fieldStaffId: string; }

export async function getLocationOwner(): Promise<LocationOwner | null> {
  if (suspended) return null;
  const clerk = getPersistentClerk();
  if (clerk.loaded && !clerk.session) return null;
  const identity = getMobileStaffIdentity(clerk.user?.publicMetadata);
  if (clerk.loaded && (!isFieldTrackerMetadata(clerk.user?.publicMetadata) || isManagerMetadata(clerk.user?.publicMetadata))) return null;
  if (identity?.fieldStaffId) return { appUserId: identity.appUserId, fieldStaffId: identity.fieldStaffId };
  if (clerk.loaded) return null;
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    const value = raw ? JSON.parse(raw) as LocationOwner : null;
    return value?.appUserId && value.fieldStaffId ? value : null;
  } catch { return null; }
}

export async function rememberLocationOwner(owner: LocationOwner): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(owner), OPTIONS);
  suspended = false;
}

export async function forgetLocationOwner(): Promise<void> {
  suspended = true;
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
