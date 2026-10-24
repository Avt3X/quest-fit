// Durable outbox for finished activities. A recording is handed to this queue before any network
// call, so it is never lost if the request fails. Every item carries the recording's client_id,
// which makes submit_activity idempotent: retries after a timeout cannot create duplicates.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ActivitySource, ActivityType, Visibility } from '@/domain/activity-types';
import { toRoutePayload } from '@/domain/gps-filter';
import { isNetworkError, isPermanentError, toUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

import { deleteTrack, readTrack } from './track-storage';

export interface PendingActivity {
  clientId: string;
  type: ActivityType;
  source: ActivitySource;
  startedAt: string;
  elapsedTimeS: number;
  movingTimeS: number;
  distanceM: number;
  elevationGainM: number | null;
  title: string | null;
  description: string | null;
  visibility: Visibility | null;
  timezone: string;
  /** GPS points are read from track storage at upload time (keeps queue items small). */
  hasTrack: boolean;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'failed';
  lastError: string | null;
}

export interface UploadResult {
  activityId: string;
  summary: unknown;
}

interface QueueState {
  items: PendingActivity[];
  flushing: boolean;
  /** client_id -> result of the most recent successful uploads (for navigation). */
  results: Record<string, UploadResult>;
  enqueue: (item: Omit<PendingActivity, 'createdAt' | 'attempts' | 'status' | 'lastError'>) => void;
  remove: (clientId: string) => Promise<void>;
  retry: (clientId: string) => void;
}

export const useUploadQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      flushing: false,
      results: {},
      enqueue: (item) => {
        if (get().items.some((i) => i.clientId === item.clientId)) return;
        set({ items: [...get().items, { ...item, createdAt: Date.now(), attempts: 0, status: 'pending', lastError: null }] });
      },
      remove: async (clientId) => {
        set({ items: get().items.filter((i) => i.clientId !== clientId) });
        await deleteTrack(clientId);
      },
      retry: (clientId) => set({ items: get().items.map((i) => (i.clientId === clientId ? { ...i, status: 'pending', lastError: null } : i)) }),
    }),
    {
      name: 'questfit.upload-queue.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

async function submit(item: PendingActivity): Promise<UploadResult> {
  const route = item.hasTrack && item.source === 'gps' ? toRoutePayload(await readTrack(item.clientId)) : null;
  const { data, error } = await supabase.rpc('submit_activity', {
    p_client_id: item.clientId,
    p_type: item.type,
    p_source: item.source,
    p_started_at: item.startedAt,
    p_elapsed_time_s: item.elapsedTimeS,
    p_moving_time_s: item.movingTimeS,
    p_distance_m: item.distanceM,
    p_title: item.title ?? undefined,
    p_description: item.description ?? undefined,
    p_visibility: item.visibility ?? undefined,
    p_elevation_gain_m: item.elevationGainM ?? undefined,
    p_timezone: item.timezone,
    p_route: route ? (route as unknown as Json) : undefined,
  });
  if (error) throw error;
  const summary = data as { activity_id?: string } | null;
  if (!summary?.activity_id) throw new Error('The server did not confirm the activity.');
  return { activityId: summary.activity_id, summary };
}

let flushPromise: Promise<void> | null = null;
const listeners = new Set<(result: UploadResult & { clientId: string }) => void>();

export function onUploaded(listener: (result: UploadResult & { clientId: string }) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Uploads pending items in order. Stops at the first network failure; marks permanent failures. */
export function flushUploads(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    useUploadQueue.setState({ flushing: true });
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      for (const item of useUploadQueue.getState().items.filter((i) => i.status === 'pending')) {
        try {
          const result = await submit(item);
          useUploadQueue.setState((s) => ({
            items: s.items.filter((i) => i.clientId !== item.clientId),
            results: { ...s.results, [item.clientId]: result },
          }));
          await deleteTrack(item.clientId);
          listeners.forEach((l) => l({ ...result, clientId: item.clientId }));
        } catch (error) {
          const permanent = isPermanentError(error) && !isNetworkError(error);
          useUploadQueue.setState((s) => ({
            items: s.items.map((i) =>
              i.clientId === item.clientId
                ? { ...i, attempts: i.attempts + 1, status: permanent ? 'failed' : 'pending', lastError: toUserMessage(error) }
                : i,
            ),
          }));
          if (!permanent) break;
        }
      }
    } finally {
      useUploadQueue.setState({ flushing: false });
      flushPromise = null;
    }
  })();
  return flushPromise;
}
