import { describe, expect, it } from '@jest/globals';
import { getAdjacentCategoryKey } from './equipmentCategories';

describe('getAdjacentCategoryKey', () => {
  const keys = ['hood:1', 'hood:2', 'exhaustFan:1'];

  it('steps forward and back', () => {
    expect(getAdjacentCategoryKey(keys, 'hood:2', 1)).toBe('exhaustFan:1');
    expect(getAdjacentCategoryKey(keys, 'hood:2', -1)).toBe('hood:1');
  });

  it('returns null past either end instead of wrapping', () => {
    expect(getAdjacentCategoryKey(keys, 'exhaustFan:1', 1)).toBeNull();
    expect(getAdjacentCategoryKey(keys, 'hood:1', -1)).toBeNull();
  });

  it('enters the list from an unknown or null key', () => {
    expect(getAdjacentCategoryKey(keys, null, 1)).toBe('hood:1');
    expect(getAdjacentCategoryKey(keys, 'gone', -1)).toBe('exhaustFan:1');
  });

  it('handles an empty list', () => {
    expect(getAdjacentCategoryKey([], 'hood:1', 1)).toBeNull();
  });
});
