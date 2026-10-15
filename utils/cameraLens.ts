/**
 * Finds the iPhone's ultra-wide (0.5×) lens among expo-camera's lens names.
 * Names are AVCaptureDevice localized names ("Back Ultra Wide Camera"), so
 * phones in other languages simply get no 0.5× option. Virtual multi-lens
 * devices ("Back Dual Wide Camera", "Back Triple Camera") are skipped.
 */
export function pickUltraWideLens(lenses: readonly string[]): string | null {
  return lenses.find((lens) => /ultra\s*wide/i.test(lens) && !/dual|triple/i.test(lens)) ?? null;
}
