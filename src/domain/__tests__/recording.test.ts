import {
  INTERRUPTION_THRESHOLD_MS,
  addSample,
  averageSpeedOf,
  elapsedTimeMs,
  finishSession,
  gpsSignal,
  movingTimeMs,
  pauseSession,
  recoverSession,
  resumeSession,
  saveReadiness,
  startSession,
} from '../recording';
import type { GpsSample } from '../gps-filter';

const T0 = 1_700_000_000_000;
const fix = (secondsAfterStart: number, meters: number): GpsSample => ({
  lat: 41.7 + meters / 111_195,
  lng: 44.8,
  t: T0 + secondsAfterStart * 1000,
  alt: null,
  acc: 5,
});

describe('recording session', () => {
  it('tracks moving time excluding pauses and elapsed time including them', () => {
    let s = startSession({ clientId: 'c1', type: 'run', usesGps: true, now: T0 });
    s = pauseSession(s, T0 + 600_000);
    s = resumeSession(s, T0 + 900_000);
    expect(movingTimeMs(s, T0 + 1_200_000)).toBe(900_000);
    s = finishSession(s, T0 + 1_200_000);
    expect(movingTimeMs(s, T0 + 9_999_999)).toBe(900_000);
    expect(elapsedTimeMs(s, T0 + 9_999_999)).toBe(1_200_000);
  });

  it('accumulates filtered distance and starts a new segment after resume', () => {
    let s = startSession({ clientId: 'c2', type: 'run', usesGps: true, now: T0 });
    const accepted = [];
    for (let i = 0; i <= 10; i += 1) {
      const r = addSample(s, fix(i * 5, i * 15));
      s = r.session;
      if (r.accepted) accepted.push(r.accepted);
    }
    expect(s.distanceM).toBeCloseTo(150, 0);
    s = pauseSession(s, T0 + 60_000);
    // Samples while paused are ignored, even if the user walks away.
    s = addSample(s, fix(70, 400)).session;
    expect(s.distanceM).toBeCloseTo(150, 0);
    s = resumeSession(s, T0 + 80_000);
    const first = addSample(s, fix(81, 500));
    s = first.session;
    expect(first.accepted?.seg).toBe(1);
    expect(s.distanceM).toBeCloseTo(150, 0);
    s = addSample(s, fix(86, 515)).session;
    expect(s.distanceM).toBeCloseTo(165, 0);
    expect(accepted.every((p) => p.seg === 0)).toBe(true);
  });

  it('timer-only sessions never record GPS points', () => {
    let s = startSession({ clientId: 'c3', type: 'indoor_run', usesGps: false, now: T0 });
    const r = addSample(s, fix(5, 10));
    s = r.session;
    expect(r.accepted).toBeNull();
    expect(s.distanceM).toBe(0);
    expect(gpsSignal(s, T0 + 6000)).toBe('disabled');
  });

  it('reports GPS signal quality from fix age and accuracy', () => {
    let s = startSession({ clientId: 'c4', type: 'run', usesGps: true, now: T0 });
    expect(gpsSignal(s, T0)).toBe('searching');
    s = addSample(s, fix(1, 0)).session;
    expect(gpsSignal(s, T0 + 2000)).toBe('good');
    expect(gpsSignal(s, T0 + 12_000)).toBe('weak');
    expect(gpsSignal(s, T0 + 30_000)).toBe('lost');
  });

  it('recovers an interrupted session as paused at the last sign of life', () => {
    let s = startSession({ clientId: 'c5', type: 'run', usesGps: true, now: T0 });
    s = addSample(s, fix(300, 900)).session;
    const restoredAt = T0 + 300_000 + INTERRUPTION_THRESHOLD_MS + 3_600_000;
    const recovered = recoverSession(s, restoredAt);
    expect(recovered.status).toBe('paused');
    expect(recovered.interruptedAt).toBe(T0 + 300_000);
    expect(movingTimeMs(recovered, restoredAt)).toBe(300_000);
    const finished = finishSession(recovered, restoredAt);
    expect(elapsedTimeMs(finished, restoredAt)).toBe(300_000);
    // A recently active session is left alone.
    expect(recoverSession(s, T0 + 301_000).status).toBe('recording');
  });

  it('decides how a session can be saved', () => {
    let s = startSession({ clientId: 'c6', type: 'run', usesGps: true, now: T0 });
    expect(saveReadiness(s, 0, T0 + 10_000)).toEqual({ kind: 'too_short' });
    expect(saveReadiness(s, 1, T0 + 120_000)).toEqual({ kind: 'no_route' });
    expect(saveReadiness(s, 40, T0 + 120_000)).toEqual({ kind: 'ready', source: 'gps' });
    s = startSession({ clientId: 'c7', type: 'indoor_run', usesGps: false, now: T0 });
    expect(saveReadiness(s, 0, T0 + 120_000)).toEqual({ kind: 'ready', source: 'manual' });
  });

  it('computes average speed from moving time', () => {
    let s = startSession({ clientId: 'c8', type: 'run', usesGps: true, now: T0 });
    for (let i = 0; i <= 20; i += 1) s = addSample(s, fix(i * 5, i * 15)).session;
    expect(averageSpeedOf(s, T0 + 100_000)).toBeCloseTo(3, 1);
  });
});
