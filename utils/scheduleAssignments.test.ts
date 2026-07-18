import { describe, expect, it } from '@jest/globals';

import {
  getAssignedTechnicianDisplays,
  getAssignedTechnicianNames,
  parseAssignedTechnicians
} from './scheduleAssignments';

const names: Record<string, string> = {
  '64f000000000000000000001': 'Ahmed',
  '64f000000000000000000002': 'Ziad'
};

const resolveName = (fieldStaffId: string) => names[fieldStaffId] ?? 'Unknown Technician';

describe('schedule assignment helpers', () => {
  it('parses assigned technician arrays', () => {
    expect(parseAssignedTechnicians(['64f000000000000000000001', ' 64f000000000000000000002 ', '', 42])).toEqual([
      '64f000000000000000000001',
      '64f000000000000000000002'
    ]);
  });

  it('parses assigned technician JSON text from PowerSync rows', () => {
    expect(parseAssignedTechnicians('["64f000000000000000000001","64f000000000000000000002"]')).toEqual([
      '64f000000000000000000001',
      '64f000000000000000000002'
    ]);
  });

  it('returns an empty list for invalid or non-array assignments', () => {
    expect(parseAssignedTechnicians('{bad json')).toEqual([]);
    expect(parseAssignedTechnicians('"64f000000000000000000001"')).toEqual([]);
    expect(parseAssignedTechnicians(null)).toEqual([]);
  });

  it('builds display rows and marks the current user', () => {
    expect(
      getAssignedTechnicianDisplays(
        '["64f000000000000000000001","64f000000000000000000002"]',
        '64f000000000000000000002',
        resolveName
      )
    ).toEqual([
      { id: '64f000000000000000000001', name: 'Ahmed', isCurrentUser: false },
      { id: '64f000000000000000000002', name: 'Ziad', isCurrentUser: true }
    ]);
  });

  it('resolves technician names with an unknown fallback', () => {
    expect(
      getAssignedTechnicianNames(
        ['64f000000000000000000001', '64f000000000000000000003'],
        resolveName
      )
    ).toEqual([
      'Ahmed',
      'Unknown Technician'
    ]);
  });
});
