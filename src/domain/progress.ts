// Presentation-side progress math. Authoritative values (totals, completion, unlocks) always come
// from the server; these helpers only turn them into fractions, labels and projections.

export function progressFraction(value: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

export function remainingValue(value: number, target: number | null | undefined): number {
  if (!target) return 0;
  return Math.max(0, target - value);
}

export interface Projection {
  /** Value expected at the end date if the current daily rate continues. */
  projectedValue: number;
  onTrack: boolean;
  /** Daily amount still needed to reach the target by the end (0 when reached). */
  requiredPerDay: number;
}

/** Linear projection; only meaningful after part of the window has elapsed. */
export function projectProgress(params: {
  value: number;
  target: number | null;
  startsAt: Date;
  endsAt: Date;
  now: Date;
}): Projection | null {
  const { value, target, startsAt, endsAt, now } = params;
  if (!target) return null;
  const total = endsAt.getTime() - startsAt.getTime();
  const elapsed = Math.min(total, Math.max(0, now.getTime() - startsAt.getTime()));
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  if (total <= 0 || elapsed < 12 * 3600_000) return null;
  const rate = value / elapsed;
  const projectedValue = value + rate * remainingMs;
  const remainingDays = remainingMs / 86_400_000;
  const left = Math.max(0, target - value);
  return {
    projectedValue,
    onTrack: value >= target || projectedValue >= target,
    requiredPerDay: left === 0 ? 0 : remainingDays > 0 ? left / remainingDays : left,
  };
}

export interface LevelThreshold {
  level: number;
  xp_required: number;
  title?: string;
}

export interface LevelProgress {
  level: number;
  title: string | null;
  levelFloorXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpToNext: number | null;
  fraction: number;
}

export function levelProgress(xpTotal: number, levels: readonly LevelThreshold[]): LevelProgress {
  const sorted = [...levels].sort((a, b) => a.xp_required - b.xp_required);
  let current: LevelThreshold = sorted[0] ?? { level: 1, xp_required: 0 };
  for (const l of sorted) {
    if (l.xp_required <= xpTotal) current = l;
  }
  const next = sorted.find((l) => l.xp_required > xpTotal) ?? null;
  const span = next ? next.xp_required - current.xp_required : 0;
  const into = xpTotal - current.xp_required;
  return {
    level: current.level,
    title: current.title ?? null,
    levelFloorXp: current.xp_required,
    nextLevelXp: next ? next.xp_required : null,
    xpIntoLevel: into,
    xpToNext: next ? next.xp_required - xpTotal : null,
    fraction: next && span > 0 ? Math.max(0, Math.min(1, into / span)) : 1,
  };
}

export interface CheckpointLike {
  position: number;
  name: string;
  distance_m: number;
}

export interface JourneyPosition<C extends CheckpointLike> {
  fraction: number;
  completedM: number;
  remainingM: number;
  /** Last checkpoint at or behind the marker. */
  current: C | null;
  /** Next checkpoint ahead of the marker (null when finished). */
  next: C | null;
  distanceToNextM: number | null;
}

export function journeyPosition<C extends CheckpointLike>(progressM: number, totalM: number, checkpoints: readonly C[]): JourneyPosition<C> {
  const sorted = [...checkpoints].sort((a, b) => a.distance_m - b.distance_m);
  const completedM = Math.min(Math.max(0, progressM), totalM);
  let current: C | null = null;
  let next: C | null = null;
  for (const c of sorted) {
    if (c.distance_m <= completedM) current = c;
    else if (!next) next = c;
  }
  return {
    fraction: totalM > 0 ? completedM / totalM : 0,
    completedM,
    remainingM: Math.max(0, totalM - completedM),
    current,
    next,
    distanceToNextM: next ? next.distance_m - completedM : null,
  };
}

/** Days needed to cover `remainingM` at the recent daily average; null when not meaningful. */
export function estimateDaysToFinish(remainingM: number, recentDistanceM: number, recentDays: number): number | null {
  if (remainingM <= 0) return 0;
  if (recentDays <= 0 || recentDistanceM <= 0) return null;
  const perDay = recentDistanceM / recentDays;
  return Math.ceil(remainingM / perDay);
}

export type Vec2 = readonly [number, number];

/** Point at `fraction` (0..1) of the polyline's arc length; used to place journey markers. */
export function pointAlongPath(path: readonly Vec2[], fraction: number): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return { x: path[0][0], y: path[0][1] };
  const f = Math.max(0, Math.min(1, fraction));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const len = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lengths.push(len);
    total += len;
  }
  let target = f * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? Math.min(1, target / lengths[i]) : 0;
      return {
        x: path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        y: path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      };
    }
    target -= lengths[i];
  }
  const last = path[path.length - 1];
  return { x: last[0], y: last[1] };
}

/** Returns the sub-polyline from the start up to `fraction` of its length (the travelled part). */
export function pathUpTo(path: readonly Vec2[], fraction: number): Vec2[] {
  if (path.length < 2) return [...path];
  const f = Math.max(0, Math.min(1, fraction));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const len = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lengths.push(len);
    total += len;
  }
  const out: Vec2[] = [path[0]];
  let target = f * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target >= lengths[i]) {
      out.push(path[i + 1]);
      target -= lengths[i];
    } else {
      const t = lengths[i] > 0 ? target / lengths[i] : 0;
      out.push([path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t]);
      break;
    }
  }
  return out;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/**
 * The server stores the most recent streak run (length + last date). A daily streak is still
 * alive if its last day is today or yesterday; a weekly streak if its last week is this or last.
 */
export function activeStreak(kind: 'daily' | 'weekly', length: number, lastDate: string | null, today: string): number {
  if (!lastDate || length <= 0) return 0;
  const gap = dayDiff(today, lastDate);
  if (kind === 'daily') return gap <= 1 ? length : 0;
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return gap <= weekday + 7 ? length : 0;
}

export function timeRemainingLabel(endsAt: Date, now: Date): string {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 'Ended';
  const hours = ms / 3600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min left`;
  if (hours < 48) return `${Math.round(hours)} h left`;
  return `${Math.round(hours / 24)} days left`;
}

export function timeUntilLabel(startsAt: Date, now: Date): string {
  const ms = startsAt.getTime() - now.getTime();
  if (ms <= 0) return 'Started';
  const hours = ms / 3600_000;
  if (hours < 48) return `Starts in ${Math.max(1, Math.round(hours))} h`;
  return `Starts in ${Math.round(hours / 24)} days`;
}
