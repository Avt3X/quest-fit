// Client-side GPS sample filtering. Goal: never add distance from bad fixes, never fabricate
// points, and lose as little real movement as possible.
//
// Assumptions (documented in docs/ARCHITECTURE.md):
// - Fixes with a reported horizontal accuracy worse than maxAccuracyM are discarded entirely.
// - Movement smaller than the jitter threshold is not discarded but deferred: the anchor point
//   does not advance, so slow real movement accumulates until it clears the threshold.
// - A fix implying a speed above the activity's plausible maximum is a jump (glitch, tunnel exit,
//   or vehicle) and is discarded; the anchor stays put. The server applies the same jump rule.
// - Distance is never counted between segments (pause/resume starts a new segment).
import { MAX_SEGMENT_SPEED_MPS } from './activity-rules';
import type { ActivityType } from './activity-types';
import { haversineMeters } from './geo';

export interface GpsSample {
  lat: number;
  lng: number;
  /** Epoch milliseconds of the fix. */
  t: number;
  alt: number | null;
  /** Horizontal accuracy radius in meters, if reported. */
  acc: number | null;
}

export interface TrackPoint extends GpsSample {
  seg: number;
}

export interface GpsFilterConfig {
  maxAccuracyM: number;
  maxSpeedMps: number;
  minMoveM: number;
  maxJitterThresholdM: number;
}

export function gpsFilterConfig(type: ActivityType): GpsFilterConfig {
  return {
    maxAccuracyM: 35,
    maxSpeedMps: MAX_SEGMENT_SPEED_MPS[type],
    minMoveM: type === 'ride' ? 5 : 3,
    maxJitterThresholdM: 12,
  };
}

export type RejectReason = 'inaccurate' | 'invalid' | 'out_of_order' | 'stationary' | 'jump';

export type SampleDecision =
  | { kind: 'accept'; distanceM: number }
  | { kind: 'reject'; reason: RejectReason };

export function isValidCoordinate(s: Pick<GpsSample, 'lat' | 'lng' | 't'>): boolean {
  return (
    Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.t) &&
    s.lat >= -90 && s.lat <= 90 && s.lng >= -180 && s.lng <= 180 &&
    !(s.lat === 0 && s.lng === 0)
  );
}

/**
 * Decides whether `sample` extends the track whose last accepted point (in the current segment)
 * is `anchor`. Pass `anchor = null` at the start of a segment.
 */
export function evaluateSample(anchor: TrackPoint | null, sample: GpsSample, config: GpsFilterConfig): SampleDecision {
  if (!isValidCoordinate(sample)) return { kind: 'reject', reason: 'invalid' };
  if (sample.acc !== null && sample.acc > config.maxAccuracyM) return { kind: 'reject', reason: 'inaccurate' };
  if (!anchor) return { kind: 'accept', distanceM: 0 };

  const dt = (sample.t - anchor.t) / 1000;
  if (dt <= 0) return { kind: 'reject', reason: 'out_of_order' };

  const d = haversineMeters(anchor, sample);
  const jitter = Math.min(
    config.maxJitterThresholdM,
    Math.max(config.minMoveM, 0.5 * Math.max(anchor.acc ?? 0, sample.acc ?? 0)),
  );
  if (d < jitter) return { kind: 'reject', reason: 'stationary' };
  if (d / dt > config.maxSpeedMps) return { kind: 'reject', reason: 'jump' };
  return { kind: 'accept', distanceM: d };
}

/** Distance of an already-filtered track, summing only within segments. */
export function trackDistanceMeters(points: readonly TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].seg === points[i - 1].seg) total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Positive elevation gain with a small hysteresis to ignore barometric/GPS noise. */
export function elevationGainMeters(points: readonly TrackPoint[], thresholdM = 4): number {
  let gain = 0;
  let ref: number | null = null;
  for (const p of points) {
    if (p.alt === null || !Number.isFinite(p.alt)) continue;
    if (ref === null) {
      ref = p.alt;
      continue;
    }
    const diff = p.alt - ref;
    if (diff >= thresholdM) {
      gain += diff;
      ref = p.alt;
    } else if (diff <= -thresholdM) {
      ref = p.alt;
    }
  }
  return Math.round(gain);
}

/** Speed over the trailing window of recent points (m/s), or 0 when not enough data. */
export function rollingSpeed(recent: readonly TrackPoint[], windowMs = 30_000): number {
  if (recent.length < 2) return 0;
  const last = recent[recent.length - 1];
  let distance = 0;
  let startT = last.t;
  for (let i = recent.length - 1; i > 0; i -= 1) {
    const a = recent[i - 1];
    const b = recent[i];
    if (last.t - a.t > windowMs) break;
    if (a.seg === b.seg) distance += haversineMeters(a, b);
    startT = a.t;
  }
  const dt = (last.t - startT) / 1000;
  return dt > 0 ? distance / dt : 0;
}

/** Serialises points in the wire format expected by submit_activity. */
export function toRoutePayload(points: readonly TrackPoint[]): (number | null)[][] {
  return points.map((p) => [
    Math.round(p.lat * 1e6) / 1e6,
    Math.round(p.lng * 1e6) / 1e6,
    Math.round(p.t),
    p.alt === null ? null : Math.round(p.alt * 10) / 10,
    p.acc === null ? null : Math.round(p.acc * 10) / 10,
    p.seg,
  ]);
}
