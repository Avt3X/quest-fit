import { eligibilityProblem, validateActivityMetrics } from '../activity-rules';
import { customWindow, periodWindow, startOfWeek } from '../periods';
import {
  activeStreak,
  estimateDaysToFinish,
  journeyPosition,
  levelProgress,
  pathUpTo,
  pointAlongPath,
  progressFraction,
  projectProgress,
  remainingValue,
  timeRemainingLabel,
} from '../progress';
import { ordinal, rankWithTies } from '../ranking';

describe('challenge progress helpers', () => {
  it('clamps progress fractions', () => {
    expect(progressFraction(5000, 10000)).toBe(0.5);
    expect(progressFraction(15000, 10000)).toBe(1);
    expect(progressFraction(100, null)).toBe(0);
    expect(remainingValue(2500, 10000)).toBe(7500);
    expect(remainingValue(12000, 10000)).toBe(0);
  });

  it('projects completion from the current rate', () => {
    const startsAt = new Date('2026-10-01T00:00:00Z');
    const endsAt = new Date('2026-11-01T00:00:00Z');
    const now = new Date('2026-10-16T00:00:00Z');
    const p = projectProgress({ value: 50_000, target: 100_000, startsAt, endsAt, now })!;
    expect(p.onTrack).toBe(true);
    expect(p.projectedValue).toBeCloseTo(103_333, -2);
    expect(p.requiredPerDay).toBeCloseTo(50_000 / 16, 0);
    expect(projectProgress({ value: 0, target: 100, startsAt, endsAt, now: startsAt })).toBeNull();
  });
});

describe('levels', () => {
  const levels = [
    { level: 1, xp_required: 0, title: 'Wanderer' },
    { level: 2, xp_required: 50, title: 'Wanderer' },
    { level: 3, xp_required: 174, title: 'Wanderer' },
  ];

  it('finds the current level and progress to the next', () => {
    expect(levelProgress(0, levels)).toMatchObject({ level: 1, xpToNext: 50, fraction: 0 });
    const mid = levelProgress(112, levels);
    expect(mid.level).toBe(2);
    expect(mid.xpToNext).toBe(62);
    expect(mid.fraction).toBeCloseTo(0.5, 2);
  });

  it('caps at the top level', () => {
    expect(levelProgress(10_000, levels)).toMatchObject({ level: 3, nextLevelXp: null, xpToNext: null, fraction: 1 });
  });
});

describe('journeys', () => {
  const checkpoints = [
    { position: 0, name: 'Start', distance_m: 0 },
    { position: 1, name: 'Bridge', distance_m: 3000 },
    { position: 2, name: 'Summit', distance_m: 10000 },
  ];

  it('locates the marker between checkpoints', () => {
    const p = journeyPosition(4500, 10000, checkpoints);
    expect(p.current?.name).toBe('Bridge');
    expect(p.next?.name).toBe('Summit');
    expect(p.distanceToNextM).toBe(5500);
    expect(p.fraction).toBe(0.45);
    expect(p.remainingM).toBe(5500);
  });

  it('clamps overshoot at the finish', () => {
    const p = journeyPosition(12000, 10000, checkpoints);
    expect(p.fraction).toBe(1);
    expect(p.next).toBeNull();
    expect(p.current?.name).toBe('Summit');
  });

  it('estimates days from recent activity', () => {
    expect(estimateDaysToFinish(10_000, 14_000, 14)).toBe(10);
    expect(estimateDaysToFinish(10_000, 0, 14)).toBeNull();
    expect(estimateDaysToFinish(0, 0, 14)).toBe(0);
  });

  it('places points along a path by arc length', () => {
    const path = [[0, 0], [1, 0], [1, 1]] as const;
    expect(pointAlongPath(path, 0.5)).toEqual({ x: 1, y: 0 });
    expect(pointAlongPath(path, 0.75)).toEqual({ x: 1, y: 0.5 });
    expect(pointAlongPath(path, 2)).toEqual({ x: 1, y: 1 });
    expect(pathUpTo(path, 0.25)).toEqual([[0, 0], [0.5, 0]]);
  });
});

describe('streaks', () => {
  it('keeps a daily streak alive through today', () => {
    expect(activeStreak('daily', 5, '2026-10-23', '2026-10-24')).toBe(5);
    expect(activeStreak('daily', 5, '2026-10-24', '2026-10-24')).toBe(5);
    expect(activeStreak('daily', 5, '2026-10-22', '2026-10-24')).toBe(0);
  });

  it('keeps a weekly streak alive through the current week', () => {
    // 2026-10-24 is a Saturday; the streak's last week started Monday 2026-10-12.
    expect(activeStreak('weekly', 3, '2026-10-12', '2026-10-24')).toBe(3);
    expect(activeStreak('weekly', 3, '2026-10-05', '2026-10-24')).toBe(0);
  });
});

describe('rankings', () => {
  it('uses standard competition ranking with stable tie order', () => {
    const ranked = rankWithTies(
      [{ id: 'a', v: 9 }, { id: 'b', v: 7 }, { id: 'c', v: 7 }, { id: 'd', v: 3 }],
      (x) => x.v,
    );
    expect(ranked.map((r) => `${r.id}${r.rank}`)).toEqual(['a1', 'b2', 'c2', 'd4']);
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(23)).toBe('23rd');
  });
});

describe('periods', () => {
  it('computes local calendar windows', () => {
    const now = new Date(2026, 9, 24, 15, 30); // Saturday
    const week = periodWindow('weekly', now);
    expect(week.start.getDay()).toBe(1);
    expect(week.end.getTime() - week.start.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 3600_000);
    expect(startOfWeek(now).getDate()).toBe(19);
    const month = periodWindow('monthly', now);
    expect(month.start.getDate()).toBe(1);
    expect(month.end.getMonth()).toBe(10);
    const custom = customWindow(new Date(2026, 9, 1), new Date(2026, 9, 10));
    expect(custom.end.getDate()).toBe(11);
  });

  it('labels remaining time', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(timeRemainingLabel(new Date('2026-10-24T12:30:00Z'), now)).toBe('30 min left');
    expect(timeRemainingLabel(new Date('2026-10-25T12:00:00Z'), now)).toBe('24 h left');
    expect(timeRemainingLabel(new Date('2026-10-30T12:00:00Z'), now)).toBe('6 days left');
    expect(timeRemainingLabel(new Date('2026-10-20T12:00:00Z'), now)).toBe('Ended');
  });
});

describe('activity rules', () => {
  it('flags implausible average speeds', () => {
    expect(eligibilityProblem('run', 10000, 3000)).toBeNull();
    expect(eligibilityProblem('run', 20000, 1800)).toMatch(/40.0 km\/h/);
    expect(eligibilityProblem('ride', 40000, 3600)).toBeNull();
    expect(eligibilityProblem('workout', 0, 3600)).toBeNull();
  });

  it('validates hard limits', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const ok = { type: 'run' as const, distanceM: 5000, movingTimeS: 1800, elapsedTimeS: 1900, startedAt: new Date('2026-10-24T08:00:00Z') };
    expect(validateActivityMetrics(ok, now)).toEqual([]);
    expect(validateActivityMetrics({ ...ok, elapsedTimeS: 100 }, now).map((p) => p.field)).toContain('elapsedTimeS');
    expect(validateActivityMetrics({ ...ok, distanceM: 400_000 }, now).map((p) => p.field)).toContain('distanceM');
    expect(validateActivityMetrics({ ...ok, startedAt: new Date('2026-10-24T11:59:00Z') }, now).map((p) => p.field)).toContain('startedAt');
  });
});
