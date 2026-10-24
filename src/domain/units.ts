// Canonical units are meters and seconds everywhere in the app and database. Conversion to the
// user's measurement system happens only here, at the presentation boundary.

export type MeasurementSystem = 'metric' | 'imperial';

export const METERS_PER_KILOMETER = 1000;
export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.28084;

export function distanceUnitMeters(system: MeasurementSystem): number {
  return system === 'imperial' ? METERS_PER_MILE : METERS_PER_KILOMETER;
}

export function distanceUnitLabel(system: MeasurementSystem): 'km' | 'mi' {
  return system === 'imperial' ? 'mi' : 'km';
}

/** Converts canonical meters to the display unit (km or mi). */
export function metersToDisplay(meters: number, system: MeasurementSystem): number {
  return meters / distanceUnitMeters(system);
}

/** Converts a user-entered value in km or mi to canonical meters (rounded to whole meters). */
export function displayToMeters(value: number, system: MeasurementSystem): number {
  return Math.round(value * distanceUnitMeters(system));
}

export function formatNumber(value: number, fractionDigits: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export interface FormatDistanceOptions {
  /** Defaults to 2 below 10 units, 1 below 100, otherwise 0. */
  fractionDigits?: number;
  withUnit?: boolean;
}

export function formatDistance(meters: number, system: MeasurementSystem, options: FormatDistanceOptions = {}): string {
  const value = metersToDisplay(Math.max(0, meters), system);
  const digits = options.fractionDigits ?? (value < 10 ? 2 : value < 100 ? 1 : 0);
  const text = formatNumber(value, digits);
  return options.withUnit === false ? text : `${text} ${distanceUnitLabel(system)}`;
}

/** Compact large distances for cards: "1.2k km". */
export function formatDistanceCompact(meters: number, system: MeasurementSystem): string {
  const value = metersToDisplay(Math.max(0, meters), system);
  if (value >= 10_000) return `${formatNumber(value / 1000, 0)}k ${distanceUnitLabel(system)}`;
  if (value >= 1000) return `${formatNumber(value / 1000, 1)}k ${distanceUnitLabel(system)}`;
  return formatDistance(meters, system);
}

export function formatElevation(meters: number, system: MeasurementSystem): string {
  return system === 'imperial'
    ? `${formatNumber(meters * FEET_PER_METER, 0)} ft`
    : `${formatNumber(meters, 0)} m`;
}

/** "1:05:09" for >= 1 hour, otherwise "5:09". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "3h 25m", "42m", "45s" for summaries. */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${s}s`;
}

/** Seconds needed to cover one display unit at the given speed, or null when not moving. */
export function paceSecondsPerUnit(speedMps: number, system: MeasurementSystem): number | null {
  if (!Number.isFinite(speedMps) || speedMps <= 0.1) return null;
  return distanceUnitMeters(system) / speedMps;
}

/** "5:12 /km". Returns "--" when there is no meaningful pace. */
export function formatPace(speedMps: number, system: MeasurementSystem, withUnit = true): string {
  const pace = paceSecondsPerUnit(speedMps, system);
  if (pace === null || pace > 99 * 60) return withUnit ? `-- /${distanceUnitLabel(system)}` : '--';
  const rounded = Math.round(pace);
  const text = `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
  return withUnit ? `${text} /${distanceUnitLabel(system)}` : text;
}

export function speedToDisplay(speedMps: number, system: MeasurementSystem): number {
  return (speedMps * 3600) / distanceUnitMeters(system);
}

export function formatSpeed(speedMps: number, system: MeasurementSystem, withUnit = true): string {
  const value = speedToDisplay(Math.max(0, speedMps), system);
  const text = formatNumber(value, 1);
  return withUnit ? `${text} ${system === 'imperial' ? 'mph' : 'km/h'}` : text;
}

export function averageSpeed(distanceMeters: number, movingSeconds: number): number {
  return movingSeconds > 0 ? distanceMeters / movingSeconds : 0;
}

/** Formats a value in a challenge metric's canonical unit. */
export function formatMetricValue(metric: 'distance' | 'duration' | 'count', value: number, system: MeasurementSystem): string {
  if (metric === 'distance') return formatDistance(value, system);
  if (metric === 'duration') return formatDurationShort(value);
  return `${formatNumber(value, 0)} ${value === 1 ? 'activity' : 'activities'}`;
}

/** Parses "1:23:45", "23:45" or "45" (minutes) into seconds. Returns null when invalid. */
export function parseDurationInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(':').map(Number);
  if (parts.length === 1) return parts[0] * 60;
  if (parts.some((p, i) => i > 0 && p >= 60)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
