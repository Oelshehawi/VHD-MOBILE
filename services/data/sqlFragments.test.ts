import { describe, expect, it } from '@jest/globals';

import { INDEXED_RANGE_PAD_DAYS, getUtcDayBoundIso } from './sqlFragments';

describe('indexed schedule range bounds', () => {
  it('produces a UTC midnight ISO bound for a date key', () => {
    expect(getUtcDayBoundIso('2026-06-15', 0)).toBe('2026-06-15T00:00:00.000Z');
  });

  it('shifts across month and year boundaries', () => {
    expect(getUtcDayBoundIso('2026-06-01', -67 - INDEXED_RANGE_PAD_DAYS)).toBe(
      '2026-03-24T00:00:00.000Z'
    );
    expect(getUtcDayBoundIso('2026-06-01', 67 + INDEXED_RANGE_PAD_DAYS)).toBe(
      '2026-08-09T00:00:00.000Z'
    );
    expect(getUtcDayBoundIso('2026-01-01', -1)).toBe('2025-12-31T00:00:00.000Z');
  });

  it('accepts a full datetime string and uses only its date part', () => {
    expect(getUtcDayBoundIso('2026-06-15T23:59:59', 0)).toBe('2026-06-15T00:00:00.000Z');
  });

  it('pads by more than the widest real timezone offset', () => {
    // A row stored with a non-UTC offset could sort up to 14h away from its true
    // instant. The pad must exceed that, or the indexed pre-filter could drop a
    // row the exact `datetime(...)` predicate would have kept.
    expect(INDEXED_RANGE_PAD_DAYS * 24).toBeGreaterThan(14);
  });

  it('returns an empty bound for an unparseable key rather than a wrong date', () => {
    expect(getUtcDayBoundIso('', 0)).toBe('');
    expect(getUtcDayBoundIso('not-a-date', 0)).toBe('');
  });
});
