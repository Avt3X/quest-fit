// Pure state machine for a live recording. Time is always derived from timestamps (never from
// tick counting), so the values stay correct across app suspension, background execution and
// process restarts. Accepted GPS points are returned to the caller for append-only storage.
import type { ActivityType } from './activity-types';
import { MIN_MOVING_TIME_S } from './activity-rules';
import { type GpsSample, type RejectReason, type TrackPoint, evaluateSample, gpsFilterConfig, rollingSpeed } from './gps-filter';

export type RecordingStatus = 'recording' | 'paused' | 'finished';

export interface RecordingSession {
  /** Idempotency key sent to the server as client_id. */
  clientId: string;
  type: ActivityType;
  /** False for indoor / timer-only sessions. */
  usesGps: boolean;
  status: RecordingStatus;
  startedAt: number;
  /** Start of the current active (unpaused) interval. */
  activeSince: number | null;
  accumulatedActiveMs: number;
  finishedAt: number | null;
  segment: number;
  distanceM: number;
  pointCount: number;
  /** Last accepted point of the current segment (the filter anchor). */
  anchor: TrackPoint | null;
  /** Short tail of accepted points for current pace. */
  recent: TrackPoint[];
  lastFixAt: number | null;
  lastFixAccuracy: number | null;
  /** Last time the app (foreground or background task) proved it was alive. */
  heartbeatAt: number;
  rejected: Partial<Record<RejectReason, number>>;
  /** Set when an interruption was detected on restore. */
  interruptedAt: number | null;
}

const RECENT_POINTS = 24;
/** If nothing (no fix, no heartbeat) happened for this long, the session was interrupted. */
export const INTERRUPTION_THRESHOLD_MS = 2 * 60_000;

export function startSession(params: { clientId: string; type: ActivityType; usesGps: boolean; now: number }): RecordingSession {
  return {
    clientId: params.clientId,
    type: params.type,
    usesGps: params.usesGps,
    status: 'recording',
    startedAt: params.now,
    activeSince: params.now,
    accumulatedActiveMs: 0,
    finishedAt: null,
    segment: 0,
    distanceM: 0,
    pointCount: 0,
    anchor: null,
    recent: [],
    lastFixAt: null,
    lastFixAccuracy: null,
    heartbeatAt: params.now,
    rejected: {},
    interruptedAt: null,
  };
}

export function pauseSession(s: RecordingSession, now: number): RecordingSession {
  if (s.status !== 'recording' || s.activeSince === null) return s;
  return {
    ...s,
    status: 'paused',
    accumulatedActiveMs: s.accumulatedActiveMs + Math.max(0, now - s.activeSince),
    activeSince: null,
    heartbeatAt: now,
  };
}

export function resumeSession(s: RecordingSession, now: number): RecordingSession {
  if (s.status !== 'paused') return s;
  return {
    ...s,
    status: 'recording',
    activeSince: now,
    // A new segment: distance is never counted across a pause.
    segment: s.segment + 1,
    anchor: null,
    recent: [],
    heartbeatAt: now,
    interruptedAt: null,
  };
}

export function finishSession(s: RecordingSession, now: number): RecordingSession {
  const paused = pauseSession(s, now);
  return { ...paused, status: 'finished', finishedAt: s.status === 'paused' && s.interruptedAt !== null ? s.interruptedAt : now };
}

export function heartbeat(s: RecordingSession, now: number): RecordingSession {
  return now > s.heartbeatAt ? { ...s, heartbeatAt: now } : s;
}

export interface SampleResult {
  session: RecordingSession;
  accepted: TrackPoint | null;
}

export function addSample(s: RecordingSession, sample: GpsSample): SampleResult {
  const withFix: RecordingSession = {
    ...s,
    lastFixAt: Math.max(s.lastFixAt ?? 0, sample.t),
    lastFixAccuracy: sample.acc,
    heartbeatAt: Math.max(s.heartbeatAt, sample.t),
  };
  // Samples taken while paused or before the session started are ignored.
  if (s.status !== 'recording' || !s.usesGps || s.activeSince === null || sample.t < s.activeSince - 5_000) {
    return { session: withFix, accepted: null };
  }
  const decision = evaluateSample(s.anchor, sample, gpsFilterConfig(s.type));
  if (decision.kind === 'reject') {
    return {
      session: { ...withFix, rejected: { ...s.rejected, [decision.reason]: (s.rejected[decision.reason] ?? 0) + 1 } },
      accepted: null,
    };
  }
  const point: TrackPoint = { ...sample, seg: s.segment };
  const recent = [...s.recent, point].slice(-RECENT_POINTS);
  return {
    session: {
      ...withFix,
      distanceM: s.distanceM + decision.distanceM,
      pointCount: s.pointCount + 1,
      anchor: point,
      recent,
    },
    accepted: point,
  };
}

/**
 * Called when a persisted session is restored (app relaunch). If the app was killed while
 * recording and nothing kept it alive, the time after the last sign of life is not counted:
 * the session is converted to "paused at the moment it was interrupted".
 */
export function recoverSession(s: RecordingSession, now: number): RecordingSession {
  if (s.status !== 'recording') return s;
  const lastAlive = Math.max(s.heartbeatAt, s.lastFixAt ?? 0);
  if (now - lastAlive <= INTERRUPTION_THRESHOLD_MS) return s;
  return { ...pauseSession(s, lastAlive), interruptedAt: lastAlive };
}

export function movingTimeMs(s: RecordingSession, now: number): number {
  const live = s.status === 'recording' && s.activeSince !== null ? Math.max(0, now - s.activeSince) : 0;
  return s.accumulatedActiveMs + live;
}

export function elapsedTimeMs(s: RecordingSession, now: number): number {
  const end = s.finishedAt ?? now;
  return Math.max(0, end - s.startedAt);
}

export function currentSpeed(s: RecordingSession): number {
  return s.status === 'recording' ? rollingSpeed(s.recent) : 0;
}

export function averageSpeedOf(s: RecordingSession, now: number): number {
  const moving = movingTimeMs(s, now) / 1000;
  return moving > 0 ? s.distanceM / moving : 0;
}

export type GpsSignal = 'disabled' | 'searching' | 'good' | 'weak' | 'lost';

export function gpsSignal(s: RecordingSession, now: number): GpsSignal {
  if (!s.usesGps) return 'disabled';
  if (s.lastFixAt === null) return 'searching';
  const age = now - s.lastFixAt;
  if (age > 20_000) return 'lost';
  if (age > 8_000 || (s.lastFixAccuracy !== null && s.lastFixAccuracy > 25)) return 'weak';
  return 'good';
}

export type SaveReadiness =
  | { kind: 'ready'; source: 'gps' | 'manual' }
  | { kind: 'too_short' }
  /** GPS was expected but too few valid points: offer saving as a manual entry. */
  | { kind: 'no_route' };

export function saveReadiness(s: RecordingSession, pointCount: number, now: number): SaveReadiness {
  const movingS = movingTimeMs(s, now) / 1000;
  const elapsedS = elapsedTimeMs(s, now) / 1000;
  if (movingS < MIN_MOVING_TIME_S || elapsedS < MIN_MOVING_TIME_S) return { kind: 'too_short' };
  if (!s.usesGps) return { kind: 'ready', source: 'manual' };
  if (pointCount < 2) return { kind: 'no_route' };
  return { kind: 'ready', source: 'gps' };
}
