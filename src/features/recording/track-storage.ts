// Append-only, chunked persistence for recorded GPS points. Writing the whole route on every fix
// would be O(n^2); chunks keep each write small and survive the app being killed mid-recording.
// Data lives in the app's private storage (AsyncStorage) and is deleted after a successful upload
// or when the user discards the recording.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TrackPoint } from '@/domain/gps-filter';

const PREFIX = 'questfit.track.';
const CHUNK_SIZE = 300;

interface TrackMeta {
  chunks: number;
  count: number;
}

const metaKey = (id: string) => `${PREFIX}${id}.meta`;
const chunkKey = (id: string, i: number) => `${PREFIX}${id}.${i}`;

let queue: Promise<unknown> = Promise.resolve();
const lastChunkCache = new Map<string, TrackPoint[]>();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function readMeta(id: string): Promise<TrackMeta> {
  const raw = await AsyncStorage.getItem(metaKey(id));
  if (!raw) return { chunks: 0, count: 0 };
  try {
    const parsed = JSON.parse(raw) as TrackMeta;
    return { chunks: parsed.chunks | 0, count: parsed.count | 0 };
  } catch {
    return { chunks: 0, count: 0 };
  }
}

export function appendPoints(id: string, points: readonly TrackPoint[]): Promise<number> {
  if (points.length === 0) return readMeta(id).then((m) => m.count);
  return serial(async () => {
    const meta = await readMeta(id);
    let index = Math.max(0, meta.chunks - 1);
    let current = meta.chunks === 0 ? [] : lastChunkCache.get(id) ?? JSON.parse((await AsyncStorage.getItem(chunkKey(id, index))) ?? '[]');
    const writes: [string, string][] = [];
    for (const p of points) {
      if (current.length >= CHUNK_SIZE) {
        writes.push([chunkKey(id, index), JSON.stringify(current)]);
        index += 1;
        current = [];
      }
      current.push(p);
    }
    writes.push([chunkKey(id, index), JSON.stringify(current)]);
    const next: TrackMeta = { chunks: index + 1, count: meta.count + points.length };
    writes.push([metaKey(id), JSON.stringify(next)]);
    await AsyncStorage.multiSet(writes);
    lastChunkCache.set(id, current);
    return next.count;
  });
}

export function readTrack(id: string): Promise<TrackPoint[]> {
  return serial(async () => {
    const meta = await readMeta(id);
    if (meta.chunks === 0) return [];
    const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(id, i));
    const entries = await AsyncStorage.multiGet(keys);
    const points: TrackPoint[] = [];
    for (const [, value] of entries) {
      if (!value) continue;
      try {
        points.push(...(JSON.parse(value) as TrackPoint[]));
      } catch {
        // A corrupted chunk is skipped rather than losing the whole recording.
      }
    }
    return points;
  });
}

export function deleteTrack(id: string): Promise<void> {
  return serial(async () => {
    const meta = await readMeta(id);
    const keys = [metaKey(id), ...Array.from({ length: meta.chunks }, (_, i) => chunkKey(id, i))];
    await AsyncStorage.multiRemove(keys);
    lastChunkCache.delete(id);
  });
}

export async function listStoredTracks(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((k) => k.startsWith(PREFIX) && k.endsWith('.meta')).map((k) => k.slice(PREFIX.length, -'.meta'.length));
}
