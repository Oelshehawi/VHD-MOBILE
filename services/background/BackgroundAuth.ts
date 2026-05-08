import { getClerkInstance } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { debugLogger } from '@/utils/DebugLogger';

const BACKGROUND_TOKEN_CACHE_KEY = 'vhd_background_powersync_token_cache';
const BACKGROUND_TOKEN_TTL_MS = 25 * 60 * 1000;
const JWT_EXP_SAFETY_MARGIN_MS = 60 * 1000;

interface CachedBackgroundToken {
  token: string;
  cachedAt: string;
}

function getJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8')
    );
    if (typeof json?.exp === 'number') {
      return json.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCachedToken(rawValue: string | null): CachedBackgroundToken | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<CachedBackgroundToken>;

    if (typeof parsed.token !== 'string' || typeof parsed.cachedAt !== 'string') {
      return null;
    }

    return {
      token: parsed.token,
      cachedAt: parsed.cachedAt
    };
  } catch {
    return null;
  }
}

function isCachedTokenFresh(cached: CachedBackgroundToken): boolean {
  const expMs = getJwtExpiryMs(cached.token);
  if (expMs !== null) {
    return Date.now() < expMs - JWT_EXP_SAFETY_MARGIN_MS;
  }

  const cachedAtMs = Date.parse(cached.cachedAt);
  if (Number.isNaN(cachedAtMs)) {
    return false;
  }

  return Date.now() - cachedAtMs <= BACKGROUND_TOKEN_TTL_MS;
}

export async function getForegroundPowerSyncToken(): Promise<string | null> {
  try {
    const clerk = getClerkInstance({
      publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    });

    if (!clerk?.session) {
      debugLogger.warn('AUTH', 'BackgroundAuth: Clerk session unavailable for foreground token');
      return null;
    }

    const token = await clerk.session.getToken({
      template: 'Powersync',
      skipCache: false
    });

    if (!token) {
      debugLogger.warn('AUTH', 'BackgroundAuth: foreground PowerSync token unavailable');
      return null;
    }

    return token;
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to read foreground PowerSync token', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function cacheBackgroundToken(token: string): Promise<void> {
  if (!token) {
    debugLogger.warn('AUTH', 'BackgroundAuth: skipping cache write due to empty token');
    return;
  }

  const cachePayload: CachedBackgroundToken = {
    token,
    cachedAt: new Date().toISOString()
  };

  try {
    await SecureStore.setItemAsync(BACKGROUND_TOKEN_CACHE_KEY, JSON.stringify(cachePayload));
    debugLogger.debug('AUTH', 'BackgroundAuth: cached background token metadata');
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to cache background token', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function getBackgroundToken(): Promise<string | null> {
  const foregroundToken = await getForegroundPowerSyncToken();
  if (foregroundToken) {
    await cacheBackgroundToken(foregroundToken);
    return foregroundToken;
  }

  try {
    const rawCacheValue = await SecureStore.getItemAsync(BACKGROUND_TOKEN_CACHE_KEY);
    const cachedToken = parseCachedToken(rawCacheValue);

    if (!cachedToken) {
      return null;
    }

    if (!isCachedTokenFresh(cachedToken)) {
      debugLogger.warn('AUTH', 'BackgroundAuth: cached background token expired');
      await clearBackgroundToken();
      return null;
    }

    return cachedToken.token;
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to read cached background token', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function clearBackgroundToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BACKGROUND_TOKEN_CACHE_KEY);
    debugLogger.debug('AUTH', 'BackgroundAuth: cleared cached background token');
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to clear cached background token', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
