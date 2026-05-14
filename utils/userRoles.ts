type RoleMetadata = {
  isManager?: unknown;
  isTechnician?: unknown;
  role?: unknown;
  roles?: unknown;
};

function isTruthyRoleFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function hasRole(metadata: RoleMetadata | null | undefined, roleName: string): boolean {
  const role = typeof metadata?.role === 'string' ? metadata.role.toLowerCase() : '';
  if (role === roleName) {
    return true;
  }

  if (!Array.isArray(metadata?.roles)) {
    return false;
  }

  return metadata.roles.some((item) => typeof item === 'string' && item.toLowerCase() === roleName);
}

export function isManagerMetadata(metadata: RoleMetadata | null | undefined): boolean {
  return isTruthyRoleFlag(metadata?.isManager) || hasRole(metadata, 'manager');
}

export function isTechnicianMetadata(metadata: RoleMetadata | null | undefined): boolean {
  return isTruthyRoleFlag(metadata?.isTechnician) || hasRole(metadata, 'technician');
}
