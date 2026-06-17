import { describe, expect, it } from '@jest/globals';
import { batteryHintCopy } from '@/components/location/batteryHintCopy';

describe('batteryHintCopy', () => {
  it('mentions the key "Unrestricted" battery setting', () => {
    expect(batteryHintCopy.body).toMatch(/Unrestricted/);
    expect(batteryHintCopy.banner).toMatch(/Unrestricted/);
  });

  it('includes actionable steps with a Samsung-specific hint', () => {
    expect(batteryHintCopy.steps.length).toBeGreaterThanOrEqual(3);
    expect(batteryHintCopy.steps.some((step) => /Samsung/.test(step))).toBe(true);
  });

  it('provides open and dismiss labels', () => {
    expect(batteryHintCopy.openLabel).toBe('Open app settings');
    expect(batteryHintCopy.dismissLabel).toBe('Not now');
  });
});
