const INITIAL_STATE_ACCURACY_BUFFER_CAP_METERS = 100;

function isLocationInsideRadius(
  distanceMeters: number,
  radiusMeters: number,
  accuracyMeters?: number | null
): boolean {
  const accuracyBuffer =
    typeof accuracyMeters === 'number' && accuracyMeters > 0
      ? Math.min(accuracyMeters, INITIAL_STATE_ACCURACY_BUFFER_CAP_METERS)
      : 0;

  return distanceMeters <= radiusMeters + accuracyBuffer;
}

export function shouldEmitInitialDepotEnter(args: {
  window: {
    id: string;
    depotRadiusMeters?: number;
  };
  distanceMeters: number | null;
  accuracyMeters?: number | null;
  arrivedWindowIds: string[];
  exitedWindowIds: string[];
}): boolean {
  if (args.arrivedWindowIds.includes(args.window.id)) return false;
  if (args.exitedWindowIds.includes(args.window.id)) return false;
  if (
    args.distanceMeters === null ||
    typeof args.window.depotRadiusMeters !== 'number'
  ) {
    return false;
  }

  return isLocationInsideRadius(
    args.distanceMeters,
    args.window.depotRadiusMeters,
    args.accuracyMeters
  );
}
