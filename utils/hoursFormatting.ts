/**
 * Hours formatting utilities for payroll display.
 */

function formatHoursValue(hours: number): string {
  if (!Number.isFinite(hours)) return '0';

  const rounded = Math.round(Math.max(0, hours) * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Format the actual payroll hours value with an "h" suffix.
 *
 * Payroll corrections can be per-worker and fractional, so this intentionally
 * does not round to legacy schedule buckets.
 */
export function formatHoursDisplay(hours: number): string {
  return `${formatHoursValue(hours)}h`;
}
