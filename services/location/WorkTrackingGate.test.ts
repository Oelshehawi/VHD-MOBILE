import { describe, expect, it, jest } from '@jest/globals';
jest.mock('./LocationAccount', () => ({ getLocationOwner: jest.fn() }));
jest.mock('./TrackingReadiness', () => ({ readTrackingReadiness: jest.fn() }));
import { workTrackingProblem } from './WorkTrackingGate';
import type { TrackingReadiness } from './TrackingReadiness';
const ready: TrackingReadiness = { observedAt: new Date().toISOString(), permission: { kind: 'granted' },
  accuracyAuthorization: 'full', backgroundRefresh: 'available', batteryRestricted: false, lowPowerMode: false };
describe('work action readiness', () => {
  it('requires verified precision and background readiness on iPhone', () => {
    expect(workTrackingProblem(ready, 'ios')).toBeNull();
    expect(workTrackingProblem({ ...ready, accuracyAuthorization: 'unknown' }, 'ios')).toMatch(/Precise/);
    expect(workTrackingProblem({ ...ready, backgroundRefresh: 'denied' }, 'ios')).toMatch(/Background/);
  });
  it('does not block solely for Low Power Mode but enforces Android restrictions', () => {
    expect(workTrackingProblem({ ...ready, lowPowerMode: true }, 'ios')).toBeNull();
    expect(workTrackingProblem({ ...ready, batteryRestricted: true }, 'android')).toMatch(/Unrestricted/);
  });
});
