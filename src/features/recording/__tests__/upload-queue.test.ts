import AsyncStorage from '@react-native-async-storage/async-storage';

import { appendPoints, readTrack } from '../track-storage';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
  },
}));

// Imported after the mock so the queue talks to the fake client.
// eslint-disable-next-line import/first
import { flushUploads, useUploadQueue } from '../upload-queue';

const base = {
  type: 'run' as const,
  source: 'gps' as const,
  startedAt: '2026-10-24T08:00:00.000Z',
  elapsedTimeS: 1900,
  movingTimeS: 1800,
  distanceM: 5000,
  elevationGainM: null,
  title: null,
  description: null,
  visibility: 'friends' as const,
  timezone: 'Asia/Tbilisi',
  hasTrack: true,
};

beforeEach(async () => {
  mockRpc.mockReset();
  await AsyncStorage.clear();
  useUploadQueue.setState({ items: [], results: {}, flushing: false });
});

describe('upload queue', () => {
  it('uploads with the recording client_id and route, then clears the local track', async () => {
    await appendPoints('c1', [
      { lat: 41.7, lng: 44.8, t: 1, alt: null, acc: 5, seg: 0 },
      { lat: 41.701, lng: 44.8, t: 2, alt: null, acc: 5, seg: 0 },
    ]);
    mockRpc.mockResolvedValueOnce({ data: { activity_id: 'a1', xp_gained: 40 }, error: null });
    useUploadQueue.getState().enqueue({ clientId: 'c1', ...base });
    await flushUploads();

    expect(mockRpc).toHaveBeenCalledWith('submit_activity', expect.objectContaining({ p_client_id: 'c1', p_source: 'gps' }));
    const args = mockRpc.mock.calls[0][1] as { p_route: unknown[] };
    expect(args.p_route).toHaveLength(2);
    expect(useUploadQueue.getState().items).toHaveLength(0);
    expect(useUploadQueue.getState().results.c1.activityId).toBe('a1');
    expect(await readTrack('c1')).toEqual([]);
  });

  it('keeps the activity on the device when the network fails and retries later', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    useUploadQueue.getState().enqueue({ clientId: 'c2', ...base, hasTrack: false, source: 'manual' });
    await flushUploads();
    const [item] = useUploadQueue.getState().items;
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
    expect(item.lastError).toMatch(/offline/i);

    mockRpc.mockResolvedValueOnce({ data: { activity_id: 'a2' }, error: null });
    await flushUploads();
    expect(useUploadQueue.getState().items).toHaveLength(0);
  });

  it('marks validation rejections as failed instead of retrying forever', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Activities cannot end in the future.' } });
    useUploadQueue.getState().enqueue({ clientId: 'c3', ...base, hasTrack: false, source: 'manual' });
    await flushUploads();
    const [item] = useUploadQueue.getState().items;
    expect(item.status).toBe('failed');
    expect(item.lastError).toBe('Activities cannot end in the future.');
    await flushUploads();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('never enqueues the same recording twice and runs one flush at a time', async () => {
    useUploadQueue.getState().enqueue({ clientId: 'c4', ...base, hasTrack: false, source: 'manual' });
    useUploadQueue.getState().enqueue({ clientId: 'c4', ...base, hasTrack: false, source: 'manual' });
    expect(useUploadQueue.getState().items).toHaveLength(1);
    let resolve: (v: unknown) => void = () => undefined;
    mockRpc.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const a = flushUploads();
    const b = flushUploads();
    resolve({ data: { activity_id: 'a4' }, error: null });
    await Promise.all([a, b]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('track storage', () => {
  it('appends across chunk boundaries without losing or reordering points', async () => {
    const points = Array.from({ length: 700 }, (_, i) => ({ lat: 41 + i / 1e5, lng: 44, t: i, alt: null, acc: 5, seg: 0 }));
    await appendPoints('big', points.slice(0, 250));
    await appendPoints('big', points.slice(250, 640));
    await appendPoints('big', points.slice(640));
    const stored = await readTrack('big');
    expect(stored).toHaveLength(700);
    expect(stored.map((p) => p.t)).toEqual(points.map((p) => p.t));
  });
});
