import { describe, expect, it } from '@jest/globals';

import { isBelowMinVersion } from './appVersion';

describe('isBelowMinVersion', () => {
  it('blocks versions below the minimum', () => {
    expect(isBelowMinVersion('2.0.0', '2.1.0')).toBe(true);
    expect(isBelowMinVersion('1.9.9', '2.0.0')).toBe(true);
    expect(isBelowMinVersion('2.1', '2.1.1')).toBe(true);
  });

  it('allows versions at or above the minimum', () => {
    expect(isBelowMinVersion('2.1.0', '2.1.0')).toBe(false);
    expect(isBelowMinVersion('2.1', '2.1.0')).toBe(false);
    expect(isBelowMinVersion('2.2.0', '2.1.0')).toBe(false);
    expect(isBelowMinVersion('3.0.0', '2.9.9')).toBe(false);
  });

  it('compares numerically, not as strings', () => {
    expect(isBelowMinVersion('2.9.0', '2.10.0')).toBe(true);
    expect(isBelowMinVersion('2.10.0', '2.9.0')).toBe(false);
  });

  it('never blocks when either version is missing or unparseable', () => {
    expect(isBelowMinVersion('2.0.0', null)).toBe(false);
    expect(isBelowMinVersion('2.0.0', '')).toBe(false);
    expect(isBelowMinVersion(null, '2.1.0')).toBe(false);
    expect(isBelowMinVersion('2.0.0', 'latest')).toBe(false);
    expect(isBelowMinVersion('unknown', '2.1.0')).toBe(false);
  });
});
