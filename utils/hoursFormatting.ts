/**
 * Hours formatting utilities for schedule display
 */

// Valid bucket values for hours display
const HOUR_BUCKETS = [2, 4, 6, 8, 12] as const;
type HourBucket = (typeof HOUR_BUCKETS)[number];

/**
 * Round hours up to the nearest bucket value from {2, 4, 6, 8, 12}
 * @param hours - The actual hours value
 * @returns The rounded bucket value
 *
 * @example
 * roundHoursToBucket(1) // 2
 * roundHoursToBucket(3) // 4
 * roundHoursToBucket(5) // 6
 * roundHoursToBucket(7) // 8
 * roundHoursToBucket(10) // 12
 */
export function roundHoursToBucket(hours: number): HourBucket {
  // Handle edge cases
  if (hours <= 0) return 2;
  if (hours > 12) return 12;

  // Find the smallest bucket that is >= hours
  for (const bucket of HOUR_BUCKETS) {
    if (hours <= bucket) {
      return bucket;
    }
  }

  // Fallback to max bucket
  return 12;
}

/**
 * Format hours for display with "h" suffix
 * @param hours - The hours value (will be bucketed)
 * @returns Formatted string like "4h"
 */
export function formatHoursDisplay(hours: number): string {
  return `${roundHoursToBucket(hours)}h`;
}
