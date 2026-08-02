import { describe, expect, it } from '@jest/globals';

import {
  formatStoredDateReadable,
  formatVancouverDateAsUtcDateOnly,
  formatVancouverTimestamp,
  getBcBusinessDateKey
} from './date';

describe('B.C. operational dates', () => {
  it('uses permanent UTC-7 at the former winter midnight boundary', () => {
    const instant = new Date('2026-12-10T07:30:00.000Z');

    expect(getBcBusinessDateKey(instant)).toBe('2026-12-10');
    expect(formatVancouverDateAsUtcDateOnly(instant)).toBe('2026-12-10T00:00:00.000Z');
    expect(formatVancouverTimestamp(instant)).toBe('2026-12-10T00:30:00-07:00');
  });

  it('preserves historical Vancouver interpretation for timestamp-backed dates', () => {
    expect(formatStoredDateReadable('2026-01-10T07:30:00.000Z')).toBe(
      'Friday, Jan 9, 2026'
    );
    expect(formatVancouverTimestamp(new Date('2026-01-10T17:00:00.000Z'))).toBe(
      '2026-01-10T09:00:00-08:00'
    );
  });

  it('keeps UTC-midnight date-only values on their stored calendar date', () => {
    expect(formatStoredDateReadable('2026-12-10T00:00:00.000Z')).toBe(
      'Thursday, Dec 10, 2026'
    );
  });
});
