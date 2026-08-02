import { describe, expect, it } from '@jest/globals';

import {
  BC_PERMANENT_TIME_ZONE,
  getEffectiveTimeZoneForInstant,
  VANCOUVER_TIME_ZONE
} from './bcTime';

describe('permanent B.C. timezone contract', () => {
  it('preserves historical Vancouver rules immediately before the transition', () => {
    expect(
      getEffectiveTimeZoneForInstant(VANCOUVER_TIME_ZONE, '2026-03-08T09:59:59.999Z')
    ).toBe(VANCOUVER_TIME_ZONE);
  });

  it('uses permanent UTC-7 at the transition instant and afterward', () => {
    expect(
      getEffectiveTimeZoneForInstant(VANCOUVER_TIME_ZONE, '2026-03-08T10:00:00.000Z')
    ).toBe(BC_PERMANENT_TIME_ZONE);
    expect(
      getEffectiveTimeZoneForInstant(VANCOUVER_TIME_ZONE, '2026-12-10T16:00:00.000Z')
    ).toBe(BC_PERMANENT_TIME_ZONE);
  });

  it('leaves other valid IANA timezones unchanged', () => {
    expect(
      getEffectiveTimeZoneForInstant('America/Toronto', '2026-12-10T16:00:00.000Z')
    ).toBe('America/Toronto');
  });
});
