export const ASSIGNED_TO_USER_CLAUSE = `
  json_valid(assignedTechnicians)
  AND EXISTS (
    SELECT 1 FROM json_each(assignedTechnicians) WHERE value = ?
  )
`;

/**
 * `YYYY-MM-DDT00:00:00.000Z` for a `YYYY-MM-DD` key shifted by `offsetDays`.
 *
 * Used to add an *indexed* pre-filter to schedule date-range queries. Wrapping
 * the column in `datetime(...)` — which the exact predicates still do — makes
 * the comparison non-sargable, so SQLite falls back to scanning every row.
 * Comparing the bare `scheduledStartAtUtc` column against these bounds matches
 * the `scheduledStartAtUtc` index declared in `services/database/schema.ts`.
 *
 * The bound is deliberately padded by the caller: it only narrows which rows
 * SQLite examines, while the existing `datetime(...)` predicate still decides
 * membership exactly. That keeps the result set identical even if a row were
 * ever stored with a non-`Z` offset, where a raw string compare would be off by
 * up to 14 hours.
 */
export function getUtcDayBoundIso(dateKey: string, offsetDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!match) return '';

  const [, year, month, day] = match;
  const bound = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + offsetDays));
  return bound.toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

/** Padding that safely exceeds any real timezone offset (max ±14h). */
export const INDEXED_RANGE_PAD_DAYS = 2;
