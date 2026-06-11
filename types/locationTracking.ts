export type TrackingWindowStatus = 'planned' | 'active' | 'expired' | 'cancelled';
export type LocationUpdateMode = 'travel_only';
export type LocationEventType =
  | 'location_ping'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'tracking_started'
  | 'tracking_stopped'
  | 'permission_denied'
  | 'location_stale';
export type LocationRegionType = 'depot' | 'job';
export type LocationEventSource = 'geofence' | 'background_location' | 'manual' | 'system';
export type LocationEventPlatform = 'ios' | 'android';

export interface GeofenceTarget {
  address?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface TechnicianTrackingWindow {
  id: string;
  technicianId: string;
  scheduleId: string;
  serviceJobId: string;
  status: TrackingWindowStatus;
  scheduledStartAtUtc: string;
  timeZone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  expectedDurationMinutes: number;
  travelTimeMinutes?: number | null;
  depot: string;
  jobSite: string;
  locationUpdateMode: LocationUpdateMode;
  pingIntervalSeconds: number;
  onSitePingIntervalSeconds?: number | null;
  distanceIntervalMeters: number;
  updatedAt: string;
}

export interface ParsedTrackingWindow extends TechnicianTrackingWindow {
  depotTarget: GeofenceTarget;
  jobSiteTarget: GeofenceTarget;
}

export interface MobileLocationEvent {
  trackingWindowId?: string;
  scheduleId?: string;
  eventType: LocationEventType;
  regionType?: LocationRegionType;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  // Actual device GPS fix attached to geofence events (lat/lng stay the
  // region center for backward compatibility with the server contract).
  deviceLat?: number;
  deviceLng?: number;
  deviceAccuracyMeters?: number;
  speedMetersPerSecond?: number;
  headingDegrees?: number;
  recordedAt: string;
  source: LocationEventSource;
  platform: LocationEventPlatform;
}
