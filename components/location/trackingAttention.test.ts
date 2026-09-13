import { describe, expect, it } from '@jest/globals';
import type { TrackingHealthSnapshot } from '@/services/location/TrackingHealth';
import { trackingAttention } from './trackingAttention';

const healthyLegacySnapshot: TrackingHealthSnapshot = {
  accuracyAuthorization: 'unknown',
  backgroundRefresh: 'unknown',
  batteryRestricted: null,
  lowPowerMode: null,
  permissionKind: 'granted',
  observedAt: '2026-09-12T12:00:00.000Z',
  installationId: 'installation-1',
  platform: 'ios',
  appVersion: '2.0.0',
  locationUpdatesRunning: false,
  geofenceCount: 0,
  activeWindowCount: 0,
  lastCaptureAt: null,
  lastUploadAt: null,
  lastAccuracyMeters: null,
  queueDepth: 0,
  oldestQueuedAt: null,
  droppedEvents: 0,
  lastErrorCode: null
};

describe('trackingAttention', () => {
  it('does not warn when iPhone precision cannot be checked on the 2.0.0 runtime', () => {
    expect(trackingAttention(healthyLegacySnapshot)).toBeNull();
  });

  it('still reports actionable tracking problems when native diagnostics are unknown', () => {
    expect(trackingAttention({
      ...healthyLegacySnapshot,
      activeWindowCount: 1
    })).toBe('Scheduled location updates are not running.');
  });

  it('still reports reduced precision when a current build detects it', () => {
    expect(trackingAttention({
      ...healthyLegacySnapshot,
      accuracyAuthorization: 'reduced',
      permissionKind: 'precision-reduced'
    })).toBe('Precise Location is off.');
  });
});
