import { describe, expect, it } from '@jest/globals';
import { pickUltraWideLens } from './cameraLens';

describe('pickUltraWideLens', () => {
  it('picks the physical ultra-wide lens', () => {
    expect(
      pickUltraWideLens([
        'Back Camera',
        'Back Dual Wide Camera',
        'Back Telephoto Camera',
        'Back Triple Camera',
        'Back Ultra Wide Camera'
      ])
    ).toBe('Back Ultra Wide Camera');
  });

  it('returns null when the phone has no ultra-wide lens', () => {
    expect(pickUltraWideLens(['Back Camera'])).toBeNull();
    expect(pickUltraWideLens([])).toBeNull();
  });
});
