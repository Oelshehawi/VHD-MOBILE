import type {
  AirMoverEquipment,
  EquipmentProfile,
  HoodEquipment,
  HoodGroup,
  PhotoCategoryKind
} from '@/types';

export interface DocumentationCategory {
  key: string;
  label: string;
  kind: PhotoCategoryKind;
  source: 'profile' | 'fallback';
  equipmentIds: string[];
}

export function parseJsonArray<T>(value: T[] | string | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    }
  } catch {
    // Plain strings are treated as a single id below.
  }

  return value ? [value] : [];
}

function airMoverKind(type: string | null | undefined): PhotoCategoryKind {
  if (type === 'exhaustFan') return 'exhaustFan';
  if (type === 'ecologyUnit') return 'ecologyUnit';
  return 'other';
}

function airMoverKey(airMover: AirMoverEquipment): string {
  return `${airMoverKind(airMover.type)}:${airMover.id || airMover.label}`;
}

function fallbackCategories(): DocumentationCategory[] {
  return [
    {
      key: 'fallback:hoods',
      label: 'Hoods',
      kind: 'hood',
      source: 'fallback',
      equipmentIds: []
    },
    {
      key: 'fallback:exhaust-fans',
      label: 'Exhaust Fans',
      kind: 'exhaustFan',
      source: 'fallback',
      equipmentIds: []
    },
    {
      key: 'fallback:other',
      label: 'Other',
      kind: 'other',
      source: 'fallback',
      equipmentIds: []
    }
  ];
}

export function buildDocumentationCategories(
  profile: EquipmentProfile | null | undefined
): DocumentationCategory[] {
  const hoods = parseJsonArray<HoodEquipment>(profile?.hoods);
  const hoodGroups = parseJsonArray<HoodGroup>(profile?.hoodGroups);
  const airMovers = parseJsonArray<AirMoverEquipment>(profile?.airMovers);

  if (!profile || (hoods.length === 0 && hoodGroups.length === 0 && airMovers.length === 0)) {
    return fallbackCategories();
  }

  const groupedHoodIds = new Set<string>();
  const categories: DocumentationCategory[] = [];

  for (const group of hoodGroups) {
    const hoodIds = parseStringArray(group.hoodIds);
    hoodIds.forEach((id) => groupedHoodIds.add(id));

    categories.push({
      key: `hoodGroup:${group.id || group.label || hoodIds.join('-')}`,
      label: group.label || 'Hood group',
      kind: 'hoodGroup',
      source: 'profile',
      equipmentIds: hoodIds
    });
  }

  for (const hood of hoods) {
    if (hood.id && groupedHoodIds.has(hood.id)) {
      continue;
    }

    categories.push({
      key: `hood:${hood.id || hood.label}`,
      label: hood.label || 'Hood',
      kind: 'hood',
      source: 'profile',
      equipmentIds: hood.id ? [hood.id] : []
    });
  }

  for (const airMover of airMovers) {
    const kind = airMoverKind(airMover.type);
    categories.push({
      key: airMoverKey(airMover),
      label: airMover.label || (kind === 'exhaustFan' ? 'Exhaust fan' : 'Equipment'),
      kind,
      source: 'profile',
      equipmentIds: airMover.id ? [airMover.id] : []
    });
  }

  categories.push({
    key: 'other:other',
    label: 'Other',
    kind: 'other',
    source: 'profile',
    equipmentIds: []
  });

  return categories;
}

export function getCategoryIcon(kind: PhotoCategoryKind): string {
  if (kind === 'hood' || kind === 'hoodGroup') return 'restaurant-outline';
  if (kind === 'exhaustFan') return 'aperture-outline';
  if (kind === 'ecologyUnit') return 'leaf-outline';
  return 'camera-outline';
}

