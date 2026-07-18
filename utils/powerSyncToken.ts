const OBJECT_ID = /^[a-f\d]{24}$/i;
const FIELD_ROLES = new Set(['technician', 'helper']);
const STAFF_ROLES = new Set(['manager', 'operator', 'technician', 'helper']);

export type PowerSyncTokenPayload = {
  app_user_id?: unknown;
  exp?: unknown;
  field_staff_id?: unknown;
  role?: unknown;
};

export function parsePowerSyncTokenPayload(token: string): PowerSyncTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as PowerSyncTokenPayload) : null;
  } catch {
    return null;
  }
}

export function hasPowerSyncStaffIdentityClaims(token: string): boolean {
  const payload = parsePowerSyncTokenPayload(token);
  if (!payload || typeof payload.role !== 'string' || !STAFF_ROLES.has(payload.role)) {
    return false;
  }
  if (typeof payload.app_user_id !== 'string' || !OBJECT_ID.test(payload.app_user_id)) {
    return false;
  }
  if (FIELD_ROLES.has(payload.role)) {
    return (
      typeof payload.field_staff_id === 'string' && OBJECT_ID.test(payload.field_staff_id)
    );
  }
  return (
    payload.field_staff_id == null ||
    (typeof payload.field_staff_id === 'string' && OBJECT_ID.test(payload.field_staff_id))
  );
}
