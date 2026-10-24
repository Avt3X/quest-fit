export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. Same formula as app_private.haversine_m. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function boundsOf(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

export interface ProjectedPoint {
  x: number;
  y: number;
  segment: number;
}

/**
 * Projects lat/lng points into a width x height box (equirectangular, aspect preserved, padded),
 * for drawing route previews with SVG instead of map tiles.
 */
export function projectToBox(
  points: readonly (LatLng & { segment?: number })[],
  width: number,
  height: number,
  padding = 8,
): ProjectedPoint[] {
  const b = boundsOf(points);
  if (!b) return [];
  const midLat = toRad((b.minLat + b.maxLat) / 2);
  const spanX = Math.max((b.maxLng - b.minLng) * Math.cos(midLat), 1e-9);
  const spanY = Math.max(b.maxLat - b.minLat, 1e-9);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;
  return points.map((p) => ({
    x: offsetX + (p.lng - b.minLng) * Math.cos(midLat) * scale,
    y: offsetY + (b.maxLat - p.lat) * scale,
    segment: p.segment ?? 0,
  }));
}

/** SVG path data, starting a new sub-path whenever the recording segment changes (pauses). */
export function toSvgPath(points: readonly ProjectedPoint[]): string {
  let d = '';
  let prevSegment: number | null = null;
  for (const p of points) {
    d += `${prevSegment === p.segment ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    prevSegment = p.segment;
  }
  return d.trim();
}

/** Parses the server's route_preview JSON ([[lat,lng,segment],...]) defensively. */
export function parseRoutePreview(value: unknown): (LatLng & { segment: number })[] {
  if (!Array.isArray(value)) return [];
  const out: (LatLng & { segment: number })[] = [];
  for (const item of value) {
    if (Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number') {
      out.push({ lat: item[0], lng: item[1], segment: typeof item[2] === 'number' ? item[2] : 0 });
    }
  }
  return out;
}
