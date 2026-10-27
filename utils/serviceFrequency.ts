/**
 * Human label for ServiceJob.frequencyPerYear (backend allows 0–12).
 * Returns null when there is nothing worth showing (unset, 0 or invalid).
 */
export function formatServiceFrequency(perYear: number | null | undefined): string | null {
  if (typeof perYear !== 'number' || !Number.isInteger(perYear) || perYear < 1 || perYear > 12) {
    return null;
  }
  if (perYear === 1) return 'Once a year';
  if (perYear === 12) return 'Monthly';

  const base = perYear === 2 ? 'Twice a year' : `${perYear}× a year`;
  return 12 % perYear === 0 ? `${base} · every ${12 / perYear} months` : base;
}
