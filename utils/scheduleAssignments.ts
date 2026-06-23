export type ResolveTechnicianName = (userId: string) => string;

export interface AssignedTechnicianDisplay {
  id: string;
  name: string;
  isCurrentUser: boolean;
}

export function parseAssignedTechnicians(value: unknown): string[] {
  const parsedValue = typeof value === 'string' ? parseAssignedTechniciansJson(value) : value;

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .filter((technicianId): technicianId is string => typeof technicianId === 'string')
    .map((technicianId) => technicianId.trim())
    .filter(Boolean);
}

function parseAssignedTechniciansJson(value: string): unknown {
  if (!value.trim()) {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function getAssignedTechnicianDisplays(
  value: unknown,
  currentUserId: string | null | undefined,
  resolveTechnicianName: ResolveTechnicianName
): AssignedTechnicianDisplay[] {
  return parseAssignedTechnicians(value).map((id) => ({
    id,
    name: resolveTechnicianName(id) || 'Unknown Technician',
    isCurrentUser: Boolean(currentUserId) && id === currentUserId
  }));
}

export function getAssignedTechnicianNames(
  value: unknown,
  resolveTechnicianName: ResolveTechnicianName
): string[] {
  return parseAssignedTechnicians(value).map(
    (id) => resolveTechnicianName(id) || 'Unknown Technician'
  );
}
