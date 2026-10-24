import { haversineMeters, parseRoutePreview, projectToBox, toSvgPath } from '../geo';
import {
  type GpsSample,
  type TrackPoint,
  elevationGainMeters,
  evaluateSample,
  gpsFilterConfig,
  rollingSpeed,
  toRoutePayload,
  trackDistanceMeters,
} from '../gps-filter';

const METERS_PER_DEG_LAT = 111_195;

function sample(i: number, overrides: Partial<GpsSample> = {}, speed = 3, interval = 5): GpsSample {
  return {
    lat: 41.7 + (i * interval * speed) / METERS_PER_DEG_LAT,
    lng: 44.8,
    t: 1_700_000_000_000 + i * interval * 1000,
    alt: null,
    acc: 5,
    ...overrides,
  };
}

function filterTrack(samples: GpsSample[], type: 'run' | 'ride' | 'walk' = 'run'): { points: TrackPoint[]; distance: number } {
  const config = gpsFilterConfig(type);
  const points: TrackPoint[] = [];
  let anchor: TrackPoint | null = null;
  let distance = 0;
  for (const s of samples) {
    const decision = evaluateSample(anchor, s, config);
    if (decision.kind === 'accept') {
      anchor = { ...s, seg: 0 };
      points.push(anchor);
      distance += decision.distanceM;
    }
  }
  return { points, distance };
}

describe('haversine', () => {
  it('matches known distances', () => {
    // Tbilisi to Batumi is about 280 km as the crow flies.
    const d = haversineMeters({ lat: 41.7151, lng: 44.8271 }, { lat: 41.6168, lng: 41.6367 });
    expect(d / 1000).toBeGreaterThan(260);
    expect(d / 1000).toBeLessThan(270);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
  });
});

describe('GPS sample filtering', () => {
  it('accumulates distance for a clean track', () => {
    const { distance, points } = filterTrack(Array.from({ length: 121 }, (_, i) => sample(i)));
    expect(points).toHaveLength(121);
    expect(distance).toBeCloseTo(1800, -1);
  });

  it('discards inaccurate fixes', () => {
    const samples = Array.from({ length: 21 }, (_, i) => sample(i, i === 10 ? { acc: 80, lat: 41.8 } : {}));
    const { points, distance } = filterTrack(samples);
    expect(points).toHaveLength(20);
    expect(distance).toBeCloseTo(300, -1);
  });

  it('discards jumps faster than plausible without losing the following track', () => {
    const samples = Array.from({ length: 41 }, (_, i) => sample(i));
    samples[20] = { ...samples[20], lat: samples[20].lat + 0.05 }; // ~5.5 km teleport
    const { distance } = filterTrack(samples);
    expect(distance).toBeCloseTo(600, -1);
  });

  it('defers stationary jitter instead of adding noise distance', () => {
    const still: GpsSample[] = Array.from({ length: 60 }, (_, i) => ({
      lat: 41.7 + (i % 2 === 0 ? 0 : 0.00001), // ~1 m wobble
      lng: 44.8 + (i % 3 === 0 ? 0 : 0.00001),
      t: 1_700_000_000_000 + i * 1000,
      alt: null,
      acc: 6,
    }));
    const { distance } = filterTrack(still);
    expect(distance).toBe(0);
  });

  it('keeps slow walking distance by accumulating small steps', () => {
    // 1 m/s, one fix per second: each step is below the jitter threshold on its own.
    const samples = Array.from({ length: 61 }, (_, i) => sample(i, {}, 1, 1));
    const { distance } = filterTrack(samples, 'walk');
    expect(distance).toBeGreaterThan(55);
    expect(distance).toBeLessThanOrEqual(61);
  });

  it('rejects out-of-order and invalid samples', () => {
    const config = gpsFilterConfig('run');
    const anchor: TrackPoint = { ...sample(5), seg: 0 };
    expect(evaluateSample(anchor, sample(4), config)).toEqual({ kind: 'reject', reason: 'out_of_order' });
    expect(evaluateSample(anchor, { ...sample(6), lat: Number.NaN }, config)).toEqual({ kind: 'reject', reason: 'invalid' });
    expect(evaluateSample(null, { ...sample(0), lat: 0, lng: 0 }, config)).toEqual({ kind: 'reject', reason: 'invalid' });
  });

  it('allows higher speeds for rides than runs', () => {
    const fast = Array.from({ length: 21 }, (_, i) => sample(i, {}, 15));
    expect(filterTrack(fast, 'run').distance).toBe(0);
    expect(filterTrack(fast, 'ride').distance).toBeCloseTo(1500, -1);
  });
});

describe('track helpers', () => {
  it('never counts distance across segments', () => {
    const pts: TrackPoint[] = [0, 1, 2, 3].map((i) => ({ ...sample(i), seg: i < 2 ? 0 : 1 }));
    expect(trackDistanceMeters(pts)).toBeCloseTo(30, 0);
  });

  it('computes elevation gain with hysteresis', () => {
    const alts = [100, 101, 99, 102, 106, 110, 108, 112, 120];
    const pts: TrackPoint[] = alts.map((alt, i) => ({ ...sample(i), alt, seg: 0 }));
    expect(elevationGainMeters(pts)).toBe(20);
  });

  it('computes rolling speed over the recent window', () => {
    const pts: TrackPoint[] = Array.from({ length: 10 }, (_, i) => ({ ...sample(i), seg: 0 }));
    expect(rollingSpeed(pts)).toBeCloseTo(3, 1);
    expect(rollingSpeed(pts.slice(0, 1))).toBe(0);
  });

  it('serialises the wire format the server validates', () => {
    const payload = toRoutePayload([{ ...sample(0), alt: 512.345, seg: 2 }]);
    expect(payload[0]).toHaveLength(6);
    expect(payload[0][3]).toBe(512.3);
    expect(payload[0][5]).toBe(2);
  });

  it('projects route previews into an SVG box and splits on segments', () => {
    const preview = parseRoutePreview([[41.7, 44.8, 0], [41.71, 44.81, 0], [41.72, 44.8, 1], 'junk']);
    expect(preview).toHaveLength(3);
    const projected = projectToBox(preview, 100, 60);
    for (const p of projected) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(60);
    }
    expect(toSvgPath(projected).match(/M/g)).toHaveLength(2);
  });
});
