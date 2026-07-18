import { describe, expect, it } from '@jest/globals';

import {
  canViewHoursMetadata,
  getStaffRole,
  isManagerMetadata,
  isTechnicianMetadata
} from './userRoles';

describe('user role metadata helpers', () => {
  it('reads the canonical staff role from Clerk metadata', () => {
    expect(getStaffRole({ role: 'manager' })).toBe('manager');
    expect(getStaffRole({ role: 'operator' })).toBe('operator');
    expect(getStaffRole({ role: 'technician' })).toBe('technician');
    expect(getStaffRole({ role: 'helper' })).toBe('helper');
  });

  it('keeps legacy role flags as fallbacks', () => {
    expect(getStaffRole({ isManager: true })).toBe('manager');
    expect(getStaffRole({ isTechnician: true })).toBe('technician');
  });

  it('allows managers and field staff to view hours', () => {
    expect(canViewHoursMetadata({ role: 'manager' })).toBe(true);
    expect(canViewHoursMetadata({ role: 'technician' })).toBe(true);
    expect(canViewHoursMetadata({ role: 'helper' })).toBe(true);
    expect(canViewHoursMetadata({ role: 'operator' })).toBe(false);
  });

  it('preserves manager and technician checks for existing callers', () => {
    expect(isManagerMetadata({ role: 'manager' })).toBe(true);
    expect(isManagerMetadata({ role: 'helper' })).toBe(false);
    expect(isTechnicianMetadata({ role: 'technician' })).toBe(true);
    expect(isTechnicianMetadata({ role: 'helper' })).toBe(false);
  });
});
