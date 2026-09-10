function parseVersion(value: string): number[] | null {
  const parts = value.trim().split('.');
  if (parts.length === 0 || parts[0] === '') return null;
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  return numbers.every((part) => Number.isFinite(part) && part >= 0) ? numbers : null;
}

/**
 * True when `current` is a lower version than `min` (numeric compare, so
 * 2.10.0 > 2.9.0; missing parts count as 0). Anything unparseable returns
 * false: a garbled server value must never lock technicians out of the app.
 */
export function isBelowMinVersion(
  current: string | null | undefined,
  min: string | null | undefined
): boolean {
  if (!current || !min) return false;
  const currentParts = parseVersion(current);
  const minParts = parseVersion(min);
  if (!currentParts || !minParts) return false;

  const length = Math.max(currentParts.length, minParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = currentParts[index] ?? 0;
    const b = minParts[index] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}
