import { describe, expect, it } from '@jest/globals';
import { formatServiceFrequency } from './serviceFrequency';

describe('formatServiceFrequency', () => {
  it('hides unset, zero and invalid frequencies', () => {
    expect(formatServiceFrequency(null)).toBeNull();
    expect(formatServiceFrequency(undefined)).toBeNull();
    expect(formatServiceFrequency(0)).toBeNull();
    expect(formatServiceFrequency(-1)).toBeNull();
    expect(formatServiceFrequency(13)).toBeNull();
    expect(formatServiceFrequency(2.5)).toBeNull();
    expect(formatServiceFrequency(Number.NaN)).toBeNull();
  });

  it('uses words for once, twice and monthly', () => {
    expect(formatServiceFrequency(1)).toBe('Once a year');
    expect(formatServiceFrequency(2)).toBe('Twice a year · every 6 months');
    expect(formatServiceFrequency(12)).toBe('Monthly');
  });

  it('adds the interval when 12 divides evenly', () => {
    expect(formatServiceFrequency(3)).toBe('3× a year · every 4 months');
    expect(formatServiceFrequency(4)).toBe('4× a year · every 3 months');
    expect(formatServiceFrequency(6)).toBe('6× a year · every 2 months');
  });

  it('omits the interval otherwise', () => {
    expect(formatServiceFrequency(5)).toBe('5× a year');
    expect(formatServiceFrequency(7)).toBe('7× a year');
  });
});
