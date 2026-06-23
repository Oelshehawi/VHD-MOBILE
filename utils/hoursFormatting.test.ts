import { describe, expect, it } from '@jest/globals';

import { formatHoursDisplay } from './hoursFormatting';

describe('payroll hours formatting', () => {
  it('formats actual hours without rounding to schedule buckets', () => {
    expect(formatHoursDisplay(2)).toBe('2h');
    expect(formatHoursDisplay(2.5)).toBe('2.5h');
    expect(formatHoursDisplay(3)).toBe('3h');
    expect(formatHoursDisplay(4)).toBe('4h');
  });

  it('preserves intentional zero-hour payroll overrides', () => {
    expect(formatHoursDisplay(0)).toBe('0h');
  });
});
