const MONGO_OBJECT_ID = /^[a-f\d]{24}$/i;

export interface MobileStaffIdentity {
  appUserId: string;
  fieldStaffId: string | null;
}

function readObjectId(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && MONGO_OBJECT_ID.test(value) ? value : null;
}

export function getMobileStaffIdentity(metadata: unknown): MobileStaffIdentity | null {
  const appUserId = readObjectId(metadata, 'appUserId');
  if (!appUserId) return null;
  return {
    appUserId,
    fieldStaffId: readObjectId(metadata, 'fieldStaffId')
  };
}
