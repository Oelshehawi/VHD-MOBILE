import { describe, expect, it } from '@jest/globals';
import {
  selectActivePingWindow,
  selectSelectedTravelWindow
} from '@/services/location/fieldStatusWindowSelection';

const base = {
  startsAtUtc: '2026-05-14T14:00:00.000Z',
  endsAtUtc: '2026-05-14T21:30:00.000Z'
};

describe('selectSelectedTravelWindow', () => {
  it('prefers the latest started window over an older overlapping window', () => {
    const selected = selectSelectedTravelWindow(
      [
        { id: 'early', ...base, scheduledStartAtUtc: '2026-05-14T15:00:00.000Z' },
        {
          id: 'late',
          startsAtUtc: '2026-05-14T18:00:00.000Z',
          endsAtUtc: '2026-05-14T23:00:00.000Z',
          scheduledStartAtUtc: '2026-05-14T19:00:00.000Z'
        }
      ],
      new Date('2026-05-14T19:30:00.000Z')
    );

    expect(selected?.id).toBe('late');
  });

  it('falls back to the earliest upcoming window when none has started', () => {
    const selected = selectSelectedTravelWindow(
      [
        { id: 'later', ...base, scheduledStartAtUtc: '2026-05-14T22:00:00.000Z' },
        { id: 'soon', ...base, scheduledStartAtUtc: '2026-05-14T19:00:00.000Z' }
      ],
      new Date('2026-05-14T17:00:00.000Z')
    );

    expect(selected?.id).toBe('soon');
  });

  it('returns undefined when there are no candidate windows', () => {
    expect(selectSelectedTravelWindow([], new Date('2026-05-14T17:00:00.000Z'))).toBeUndefined();
  });
});

describe('selectActivePingWindow', () => {
  const overlappingWindows = [
    {
      id: 'early',
      startsAtUtc: '2026-05-14T14:00:00.000Z',
      scheduledStartAtUtc: '2026-05-14T15:00:00.000Z',
      endsAtUtc: '2026-05-14T22:00:00.000Z'
    },
    {
      id: 'late',
      startsAtUtc: '2026-05-14T18:00:00.000Z',
      scheduledStartAtUtc: '2026-05-14T19:00:00.000Z',
      endsAtUtc: '2026-05-14T23:00:00.000Z'
    }
  ];

  it('keeps an arrived window selected so on-site pings continue', () => {
    const selected = selectActivePingWindow(
      overlappingWindows,
      ['late'],
      new Date('2026-05-14T20:00:00.000Z')
    );

    expect(selected?.id).toBe('late');
  });

  it('does not let an earlier still-open window reclaim pings after a later arrival', () => {
    // Even when the late window is the arrived one, the early window's
    // still-open time range must not outrank it.
    const selected = selectActivePingWindow(
      [...overlappingWindows].reverse(),
      ['late'],
      new Date('2026-05-14T20:00:00.000Z')
    );

    expect(selected?.id).toBe('late');
  });

  it('returns undefined when no window is inside its time range', () => {
    const selected = selectActivePingWindow(
      overlappingWindows,
      [],
      new Date('2026-05-15T02:00:00.000Z')
    );

    expect(selected).toBeUndefined();
  });
});
