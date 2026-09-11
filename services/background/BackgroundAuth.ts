import { loadBackgroundClerk } from './clerkBootstrap';
import { withTimeout } from './withTimeout';
import * as SecureStore from 'expo-secure-store';
import { debugLogger } from '@/utils/DebugLogger';
import {
  hasPowerSyncStaffIdentityClaims,
  parsePowerSyncTokenPayload
} from '@/utils/powerSyncToken';

const BACKGROUND_TOKEN_CACHE_KEY = 'vhd_background_powersync_token_cache';
const JWT_EXP_SAFETY_MARGIN_MS = 60 * 1000;
const CACHE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let tokenInFlight: Promise<string | null> | null = null;
let tokenGeneration = 0;

interface CachedBackgroundToken {
  token: string;
  cachedAt: string;
}

function getJwtExpiryMs(token: string): number | null {
  const payload = parsePowerSyncTokenPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
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

  return false;
}

export async function getForegroundPowerSyncToken(): Promise<string | null> {
  try {
    const clerk = await loadBackgroundClerk();

    if (!clerk?.session) {
      debugLogger.warn('AUTH', 'BackgroundAuth: Clerk session unavailable for foreground token');
      return null;
    }

    const token = await withTimeout(clerk.session.getToken({
      template: 'Powersync',
      skipCache: true
    }), 6000);

    if (!token || !hasPowerSyncStaffIdentityClaims(token)) {
      debugLogger.warn(
        'AUTH',
        'BackgroundAuth: fresh PowerSync token missing staff identity claims'
      );
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
  if (!token || !hasPowerSyncStaffIdentityClaims(token)) {
    debugLogger.warn('AUTH', 'BackgroundAuth: skipping invalid PowerSync token cache write');
    return;
  }

  const cachePayload: CachedBackgroundToken = {
    token,
    cachedAt: new Date().toISOString()
  };

  try {
    await SecureStore.setItemAsync(BACKGROUND_TOKEN_CACHE_KEY, JSON.stringify(cachePayload), CACHE_OPTIONS);
    debugLogger.debug('AUTH', 'BackgroundAuth: cached background token metadata');
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to cache background token', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function readFreshCachedToken(): Promise<string | null> {
  try {
    const rawCacheValue = await SecureStore.getItemAsync(BACKGROUND_TOKEN_CACHE_KEY, CACHE_OPTIONS);
    const cachedToken = parseCachedToken(rawCacheValue);

    if (!cachedToken) {
      return null;
    }

    if (!isCachedTokenFresh(cachedToken)) {
      debugLogger.warn('AUTH', 'BackgroundAuth: cached background token expired');
      await SecureStore.deleteItemAsync(BACKGROUND_TOKEN_CACHE_KEY, CACHE_OPTIONS);
      return null;
    }

    if (!hasPowerSyncStaffIdentityClaims(cachedToken.token)) {
      debugLogger.warn('AUTH', 'BackgroundAuth: cached token lacks staff identity claims');
      await SecureStore.deleteItemAsync(BACKGROUND_TOKEN_CACHE_KEY, CACHE_OPTIONS);
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

export async function getBackgroundToken(): Promise<string | null> {
  if (tokenInFlight) return tokenInFlight;
  const generation = tokenGeneration;
  const run = (async () => {
    const cached = await readFreshCachedToken();
    if (generation !== tokenGeneration) return null;
    if (cached) return cached;
    const token = await getForegroundPowerSyncToken();
    if (generation !== tokenGeneration) return null;
    if (token) await cacheBackgroundToken(token);
    return token;
  })().finally(() => { if (tokenInFlight === run) tokenInFlight = null; });
  tokenInFlight = run;
  return tokenInFlight;
}

export async function refreshBackgroundToken(): Promise<string | null> {
  await clearBackgroundToken();
  return getBackgroundToken();
}

export async function clearBackgroundToken(): Promise<void> {
  tokenGeneration += 1;
  tokenInFlight = null;
  try {
    await SecureStore.deleteItemAsync(BACKGROUND_TOKEN_CACHE_KEY, CACHE_OPTIONS);
    debugLogger.debug('AUTH', 'BackgroundAuth: cleared cached background token');
  } catch (error) {
    debugLogger.warn('AUTH', 'BackgroundAuth: failed to clear cached background token', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
