import { describe, expect, it } from '@jest/globals';

import { getMobileStaffIdentity } from './staffIdentity';

const APP_USER_ID = '64f000000000000000000001';
const FIELD_STAFF_ID = '64f000000000000000000002';

describe('mobile staff identity', () => {
  it('reads stable AppUser and FieldStaff ids from Clerk metadata', () => {
    expect(
      getMobileStaffIdentity({ appUserId: APP_USER_ID, fieldStaffId: FIELD_STAFF_ID })
    ).toEqual({ appUserId: APP_USER_ID, fieldStaffId: FIELD_STAFF_ID });
  });

  it('allows authenticated managers without a FieldStaff row', () => {
    expect(getMobileStaffIdentity({ appUserId: APP_USER_ID, fieldStaffId: null })).toEqual({
      appUserId: APP_USER_ID,
      fieldStaffId: null
    });
  });

  it('does not fall back to a Clerk id or accept malformed Mongo ids', () => {
    expect(getMobileStaffIdentity({ clerkUserId: 'user_external' })).toBeNull();
    expect(getMobileStaffIdentity({ appUserId: 'user_external' })).toBeNull();
    expect(getMobileStaffIdentity(null)).toBeNull();
  });
});
