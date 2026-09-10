import { getClerkInstance } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';

let loading: Promise<void> | null = null;

export function getPersistentClerk() {
  return getClerkInstance({ publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, tokenCache });
}

export async function loadBackgroundClerk() {
  const clerk = getPersistentClerk();
  if (!clerk.loaded) {
    if (!loading) loading = clerk.load().finally(() => { loading = null; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([loading, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Background authentication timed out')), 8000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  return clerk;
}
