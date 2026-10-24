// Plausibility rules for activities. The database (app_private.max_* functions) is the authority;
// these copies power instant form validation. supabase/tests/rules-parity.test.ts keeps them equal.
import type { ActivityType } from './activity-types';

/** Highest plausible whole-activity average speed (m/s). Above it, the activity is ineligible. */
export const MAX_AVG_SPEED_MPS: Record<ActivityType, number> = {
  run: 7.5,
  indoor_run: 7.5,
  walk: 4.5,
  hike: 4.5,
  ride: 20,
  swim: 3,
  workout: 30,
  other: 30,
};

/** Highest plausible speed between consecutive GPS samples (m/s); faster jumps are discarded. */
export const MAX_SEGMENT_SPEED_MPS: Record<ActivityType, number> = {
  run: 12,
  walk: 8,
  hike: 8,
  ride: 35,
  indoor_run: 35,
  swim: 35,
  workout: 35,
  other: 35,
};

/** Maximum distance of a single activity (meters). */
export const MAX_DISTANCE_M: Record<ActivityType, number> = {
  run: 300_000,
  indoor_run: 100_000,
  walk: 200_000,
  hike: 200_000,
  ride: 1_000_000,
  swim: 50_000,
  workout: 300_000,
  other: 300_000,
};

export const MIN_MOVING_TIME_S = 30;
export const MAX_MOVING_TIME_S = 48 * 3600;
export const MAX_ELAPSED_TIME_S = 72 * 3600;
export const MAX_BACKDATE_DAYS = 365;

export interface ActivityMetrics {
  type: ActivityType;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  startedAt: Date;
}

export type MetricsProblem =
  | { field: 'movingTimeS'; message: string }
  | { field: 'elapsedTimeS'; message: string }
  | { field: 'distanceM'; message: string }
  | { field: 'startedAt'; message: string };

/** Hard validation: problems that make the server reject the submission. */
export function validateActivityMetrics(m: ActivityMetrics, now: Date = new Date()): MetricsProblem[] {
  const problems: MetricsProblem[] = [];
  if (!Number.isFinite(m.movingTimeS) || m.movingTimeS < MIN_MOVING_TIME_S || m.movingTimeS > MAX_MOVING_TIME_S) {
    problems.push({ field: 'movingTimeS', message: 'Moving time must be between 30 seconds and 48 hours.' });
  }
  if (!Number.isFinite(m.elapsedTimeS) || m.elapsedTimeS < m.movingTimeS || m.elapsedTimeS > MAX_ELAPSED_TIME_S) {
    problems.push({ field: 'elapsedTimeS', message: 'Elapsed time must be at least the moving time and at most 72 hours.' });
  }
  if (!Number.isFinite(m.distanceM) || m.distanceM < 0 || m.distanceM > MAX_DISTANCE_M[m.type]) {
    problems.push({ field: 'distanceM', message: `Distance must be between 0 and ${MAX_DISTANCE_M[m.type] / 1000} km.` });
  }
  const endMs = m.startedAt.getTime() + m.elapsedTimeS * 1000;
  if (endMs > now.getTime() + 10 * 60_000) {
    problems.push({ field: 'startedAt', message: 'The activity cannot end in the future.' });
  } else if (m.startedAt.getTime() < now.getTime() - MAX_BACKDATE_DAYS * 86_400_000) {
    problems.push({ field: 'startedAt', message: 'Activities older than one year cannot be added.' });
  }
  return problems;
}

/** Soft check: plausible activities count toward challenges, journeys and rewards. */
export function eligibilityProblem(type: ActivityType, distanceM: number, movingTimeS: number): string | null {
  if (movingTimeS <= 0) return 'Moving time must be greater than zero.';
  const speed = distanceM / movingTimeS;
  if (distanceM > 0 && speed > MAX_AVG_SPEED_MPS[type]) {
    return `That is an average of ${(speed * 3.6).toFixed(1)} km/h, which is not realistic for this activity type. Check the distance and time.`;
  }
  return null;
}
