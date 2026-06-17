export type StaffRole = 'manager' | 'operator' | 'technician' | 'helper';

type RoleMetadata = {
  isManager?: unknown;
  isTechnician?: unknown;
  role?: unknown;
  roles?: unknown;
  isClientPortalUser?: unknown;
};

const STAFF_ROLES: StaffRole[] = ['manager', 'operator', 'technician', 'helper'];

function isTruthyRoleFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeRole(value: unknown): StaffRole | null {
  if (typeof value !== 'string') {
    return null;
  }

  const role = value.toLowerCase();
  return STAFF_ROLES.includes(role as StaffRole) ? (role as StaffRole) : null;
}

function hasRole(metadata: RoleMetadata | null | undefined, roleName: string): boolean {
  const role = normalizeRole(metadata?.role);
  if (role === roleName) {
    return true;
  }

  if (!Array.isArray(metadata?.roles)) {
    return false;
  }

  return metadata.roles.some((item) => typeof item === 'string' && item.toLowerCase() === roleName);
}

export function getStaffRole(metadata: RoleMetadata | null | undefined): StaffRole | null {
  if (metadata?.isClientPortalUser === true) {
    return null;
  }

  return (
    normalizeRole(metadata?.role) ??
    (isTruthyRoleFlag(metadata?.isManager) ? 'manager' : null) ??
    (isTruthyRoleFlag(metadata?.isTechnician) ? 'technician' : null)
  );
}

export function isManagerMetadata(metadata: RoleMetadata | null | undefined): boolean {
  return getStaffRole(metadata) === 'manager' || hasRole(metadata, 'manager');
}

export function isTechnicianMetadata(metadata: RoleMetadata | null | undefined): boolean {
  return getStaffRole(metadata) === 'technician' || hasRole(metadata, 'technician');
}

export function canViewHoursMetadata(metadata: RoleMetadata | null | undefined): boolean {
  const role = getStaffRole(metadata);
  return role === 'manager' || role === 'technician' || role === 'helper';
}

export function isFieldTrackerMetadata(metadata: RoleMetadata | null | undefined): boolean {
  const role = getStaffRole(metadata);
  return (
    role === 'technician' ||
    role === 'helper' ||
    hasRole(metadata, 'technician') ||
    hasRole(metadata, 'helper')
  );
}
