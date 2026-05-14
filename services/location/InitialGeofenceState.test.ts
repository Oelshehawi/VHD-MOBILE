import { describe, expect, it } from '@jest/globals';
import { shouldEmitInitialDepotEnter } from '@/services/location/InitialGeofenceStateRules';

describe('shouldEmitInitialDepotEnter', () => {
  it('emits when an active window starts while already inside the depot radius', () => {
    expect(
      shouldEmitInitialDepotEnter({
        window: { id: 'window-a', depotRadiusMeters: 150 },
        distanceMeters: 80,
        accuracyMeters: 12,
        arrivedWindowIds: [],
        exitedWindowIds: []
      })
    ).toBe(true);
  });

  it('does not emit after the route has arrived at or exited the job', () => {
    expect(
      shouldEmitInitialDepotEnter({
        window: { id: 'window-a', depotRadiusMeters: 150 },
        distanceMeters: 80,
        arrivedWindowIds: ['window-a'],
        exitedWindowIds: []
      })
    ).toBe(false);

    expect(
      shouldEmitInitialDepotEnter({
        window: { id: 'window-a', depotRadiusMeters: 150 },
        distanceMeters: 80,
        arrivedWindowIds: [],
        exitedWindowIds: ['window-a']
      })
    ).toBe(false);
  });

  it('does not emit outside the depot radius', () => {
    expect(
      shouldEmitInitialDepotEnter({
        window: { id: 'window-a', depotRadiusMeters: 150 },
        distanceMeters: 400,
        accuracyMeters: 20,
        arrivedWindowIds: [],
        exitedWindowIds: []
      })
    ).toBe(false);
  });
});
