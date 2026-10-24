import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ActivityType } from '@/domain/activity-types';
import type { GpsSample, TrackPoint } from '@/domain/gps-filter';
import {
  type RecordingSession,
  addSample,
  finishSession,
  heartbeat,
  pauseSession,
  recoverSession,
  resumeSession,
  startSession,
} from '@/domain/recording';

import { appendPoints, deleteTrack, readTrack } from './track-storage';

interface RecordingState {
  session: RecordingSession | null;
  hydrated: boolean;
  /** In-memory copy of accepted points for drawing the live route (the durable copy is on disk). */
  livePoints: TrackPoint[];
  start: (type: ActivityType, usesGps: boolean) => RecordingSession;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  /** Returns to recording after "Finish" was tapped but the user chose to keep going. */
  unfinish: () => void;
  discard: () => Promise<void>;
  /** Clears the session after it has been handed to the upload queue (track is kept for upload). */
  release: () => void;
  ingest: (samples: GpsSample[]) => Promise<void>;
  loadLivePoints: () => Promise<void>;
  beat: () => void;
  recover: () => void;
}

let ingestChain: Promise<void> = Promise.resolve();

export const useRecording = create<RecordingState>()(
  persist(
    (set, get) => ({
      session: null,
      hydrated: false,
      livePoints: [],
      start: (type, usesGps) => {
        const session = startSession({ clientId: Crypto.randomUUID(), type, usesGps, now: Date.now() });
        set({ session, livePoints: [] });
        return session;
      },
      pause: () => {
        const s = get().session;
        if (s) set({ session: pauseSession(s, Date.now()) });
      },
      resume: () => {
        const s = get().session;
        if (s) set({ session: resumeSession(s, Date.now()) });
      },
      finish: () => {
        const s = get().session;
        if (s) set({ session: finishSession(s, Date.now()) });
      },
      unfinish: () => {
        const s = get().session;
        if (s && s.status === 'finished') set({ session: resumeSession({ ...s, status: 'paused', finishedAt: null }, Date.now()) });
      },
      discard: async () => {
        const s = get().session;
        set({ session: null, livePoints: [] });
        if (s) await deleteTrack(s.clientId);
      },
      release: () => set({ session: null, livePoints: [] }),
      ingest: (samples) => {
        // Serialised so background batches and foreground callbacks never interleave.
        ingestChain = ingestChain
          .then(async () => {
            await waitForHydration();
            // Read-modify-write happens synchronously so pause/resume/finish cannot interleave.
            let s = get().session;
            if (!s) return;
            const accepted: TrackPoint[] = [];
            for (const sample of [...samples].sort((a, b) => a.t - b.t)) {
              const result = addSample(s, sample);
              s = result.session;
              if (result.accepted) accepted.push(result.accepted);
            }
            set({ session: s, livePoints: accepted.length ? [...get().livePoints, ...accepted] : get().livePoints });
            if (accepted.length) await appendPoints(s.clientId, accepted);
          })
          .catch(() => undefined);
        return ingestChain;
      },
      loadLivePoints: async () => {
        const s = get().session;
        if (!s) return;
        const points = await readTrack(s.clientId);
        if (get().session?.clientId !== s.clientId) return;
        const lastT = points.length ? points[points.length - 1].t : -Infinity;
        set({ livePoints: [...points, ...get().livePoints.filter((p) => p.t > lastT)] });
      },
      beat: () => {
        const s = get().session;
        if (s && s.status === 'recording') set({ session: heartbeat(s, Date.now()) });
      },
      recover: () => {
        const s = get().session;
        if (s) set({ session: recoverSession(s, Date.now()) });
      },
    }),
    {
      name: 'questfit.recording.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ session: state.session }),
      onRehydrateStorage: () => () => {
        useRecording.setState({ hydrated: true });
      },
    },
  ),
);

function waitForHydration(): Promise<void> {
  if (useRecording.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useRecording.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
