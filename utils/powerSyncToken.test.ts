import { describe, expect, it } from '@jest/globals';
import {
  hasPowerSyncStaffIdentityClaims,
  parsePowerSyncTokenPayload
} from './powerSyncToken';

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('PowerSync token identity claims', () => {
  it('accepts managers with an AppUser id and optional FieldStaff id', () => {
    expect(
      hasPowerSyncStaffIdentityClaims(
        token({ role: 'manager', app_user_id: '507f1f77bcf86cd799439011' })
      )
    ).toBe(true);
    expect(
      hasPowerSyncStaffIdentityClaims(
        token({
          role: 'manager',
          app_user_id: '507f1f77bcf86cd799439011',
          field_staff_id: '507f191e810c19729de860ea'
        })
      )
    ).toBe(true);
  });

  it('requires both internal ids for technicians and helpers', () => {
    expect(
      hasPowerSyncStaffIdentityClaims(
        token({ role: 'technician', app_user_id: '507f1f77bcf86cd799439011' })
      )
    ).toBe(false);
    expect(
      hasPowerSyncStaffIdentityClaims(
        token({
          role: 'helper',
          app_user_id: '507f1f77bcf86cd799439011',
          field_staff_id: '507f191e810c19729de860ea'
        })
      )
    ).toBe(true);
  });

  it('rejects cached pre-cutover and malformed tokens', () => {
    expect(hasPowerSyncStaffIdentityClaims(token({ role: 'manager' }))).toBe(false);
    expect(hasPowerSyncStaffIdentityClaims('not-a-jwt')).toBe(false);
    expect(parsePowerSyncTokenPayload('not-a-jwt')).toBeNull();
  });
});
