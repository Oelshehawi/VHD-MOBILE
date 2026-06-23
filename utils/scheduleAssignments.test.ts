import { describe, expect, it } from '@jest/globals';

import {
  getAssignedTechnicianDisplays,
  getAssignedTechnicianNames,
  parseAssignedTechnicians
} from './scheduleAssignments';

const names: Record<string, string> = {
  'user-a': 'Ahmed',
  'user-b': 'Ziad'
};

const resolveName = (userId: string) => names[userId] ?? 'Unknown Technician';

describe('schedule assignment helpers', () => {
  it('parses assigned technician arrays', () => {
    expect(parseAssignedTechnicians(['user-a', ' user-b ', '', 42])).toEqual([
      'user-a',
      'user-b'
    ]);
  });

  it('parses assigned technician JSON text from PowerSync rows', () => {
    expect(parseAssignedTechnicians('["user-a","user-b"]')).toEqual(['user-a', 'user-b']);
  });

  it('returns an empty list for invalid or non-array assignments', () => {
    expect(parseAssignedTechnicians('{bad json')).toEqual([]);
    expect(parseAssignedTechnicians('"user-a"')).toEqual([]);
    expect(parseAssignedTechnicians(null)).toEqual([]);
  });

  it('builds display rows and marks the current user', () => {
    expect(getAssignedTechnicianDisplays('["user-a","user-b"]', 'user-b', resolveName)).toEqual([
      { id: 'user-a', name: 'Ahmed', isCurrentUser: false },
      { id: 'user-b', name: 'Ziad', isCurrentUser: true }
    ]);
  });

  it('resolves technician names with an unknown fallback', () => {
    expect(getAssignedTechnicianNames(['user-a', 'user-c'], resolveName)).toEqual([
      'Ahmed',
      'Unknown Technician'
    ]);
  });
});
