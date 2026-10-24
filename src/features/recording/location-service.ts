// Location acquisition for live recordings.
//
// - With "Always"/"Allow all the time" permission on iOS/Android, updates are delivered to a
//   TaskManager task, which keeps running with the screen off or the app in the background
//   (Android shows a foreground-service notification; iOS shows the blue location indicator).
// - With only "While using the app" permission, a foreground watch is used and the UI warns that
//   tracking stops while QuestFit is in the background.
// - On web, the browser Geolocation API is used (foreground only) for development and testing.
//
// The task must be defined at module load (imported from the root layout) so that iOS/Android can
// deliver locations to a freshly started JS runtime after the app was suspended.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { GpsSample } from '@/domain/gps-filter';

import { useRecording } from './recording-store';

export const LOCATION_TASK = 'questfit-activity-location';

function toSample(l: Location.LocationObject): GpsSample {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    alt: l.coords.altitude ?? null,
    acc: l.coords.accuracy ?? null,
  };
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await useRecording.getState().ingest(data.locations.map(toSample));
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface LocationReadiness {
  servicesEnabled: boolean;
  foreground: PermissionState;
  background: PermissionState;
  backgroundSupported: boolean;
}

function toState(status: Location.PermissionStatus): PermissionState {
  return status === Location.PermissionStatus.GRANTED ? 'granted' : status === Location.PermissionStatus.DENIED ? 'denied' : 'undetermined';
}

export async function getLocationReadiness(): Promise<LocationReadiness> {
  const backgroundSupported = Platform.OS !== 'web' && (await Location.isBackgroundLocationAvailableAsync().catch(() => false));
  const [services, fg, bg] = await Promise.all([
    Location.hasServicesEnabledAsync().catch(() => Platform.OS === 'web'),
    Location.getForegroundPermissionsAsync().catch(() => null),
    backgroundSupported ? Location.getBackgroundPermissionsAsync().catch(() => null) : Promise.resolve(null),
  ]);
  return {
    servicesEnabled: services,
    foreground: fg ? toState(fg.status) : 'undetermined',
    background: bg ? toState(bg.status) : 'denied',
    backgroundSupported,
  };
}

export async function requestForegroundPermission(): Promise<PermissionState> {
  const res = await Location.requestForegroundPermissionsAsync();
  return toState(res.status);
}

/** Must only be called after explaining why background access is needed. */
export async function requestBackgroundPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  const res = await Location.requestBackgroundPermissionsAsync();
  return toState(res.status);
}

let foregroundSubscription: Location.LocationSubscription | null = null;
let webWatchId: number | null = null;

export type TrackingMode = 'background' | 'foreground';

/**
 * expo-location's web watcher matches events by its own id rather than the browser's watch id, so
 * it silently drops updates when the two diverge. The browser API is used directly instead.
 */
function startWebWatch() {
  webWatchId = navigator.geolocation.watchPosition(
    (p) => {
      void useRecording.getState().ingest([
        { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp, alt: p.coords.altitude ?? null, acc: p.coords.accuracy ?? null },
      ]);
    },
    undefined,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
}

export async function startTracking(preferBackground: boolean): Promise<TrackingMode> {
  await stopTracking();
  if (Platform.OS === 'web') {
    startWebWatch();
    return 'foreground';
  }
  if (preferBackground) {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === Location.PermissionStatus.GRANTED) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 3,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'QuestFit is recording',
          notificationBody: 'Your route is being tracked. Open QuestFit to pause or finish.',
          notificationColor: '#1FC99A',
          killServiceOnDestroy: false,
        },
      });
      return 'background';
    }
  }
  foregroundSubscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
    (location) => {
      void useRecording.getState().ingest([toSample(location)]);
    },
  );
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  if (Platform.OS === 'web') {
    if (webWatchId !== null) navigator.geolocation.clearWatch(webWatchId);
    webWatchId = null;
    return;
  }
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Not started or already stopped.
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

export async function currentPosition(): Promise<GpsSample | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    if (last) return toSample(last);
    return toSample(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  } catch {
    return null;
  }
}
