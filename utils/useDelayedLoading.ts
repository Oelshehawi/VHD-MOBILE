import { useEffect, useState } from 'react';

/**
 * Default grace period before a loading placeholder is allowed to appear.
 * A local PowerSync read normally lands well inside this window, so the common
 * case renders straight to content — the placeholder never flashes, and neither
 * does the layout jump when it is replaced.
 */
export const LOADING_PLACEHOLDER_DELAY_MS = 150;

/**
 * `true` only once `isLoading` has stayed true past `delayMs`.
 *
 * Use this to gate *visual* placeholders. Do not use it to gate startup
 * readiness (`useReportInitialScreenReady`), which must react to the raw
 * `isLoading` or the splash would lift late on every cold start.
 */
export function useDelayedLoading(
  isLoading: boolean,
  delayMs: number = LOADING_PLACEHOLDER_DELAY_MS
): boolean {
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowPlaceholder(false);
      return;
    }

    const timer = setTimeout(() => setShowPlaceholder(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return showPlaceholder;
}
