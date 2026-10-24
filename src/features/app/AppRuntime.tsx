import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { toast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/api';
import { useChallengeHousekeeping } from '@/features/challenges/api';
import { usePushRegistration } from '@/features/notifications/push';
import { useMyProfile, useSyncPreferences } from '@/features/profile/api';
import { useRecording } from '@/features/recording/recording-store';
import { flushUploads, onUploaded, useUploadQueue } from '@/features/recording/upload-queue';
import { qk } from '@/lib/query-keys';

function SignedInRuntime() {
  const client = useQueryClient();
  const { expectSignOut } = useAuth();
  const me = useMyProfile();
  useSyncPreferences();
  useChallengeHousekeeping();
  usePushRegistration();

  // A valid token for an account that no longer exists (deleted on another device or by an admin).
  const profileMissing = (me.error as { code?: string } | null)?.code === 'PGRST116';
  useEffect(() => {
    if (!profileMissing) return;
    expectSignOut();
    void signOut('local').finally(() => toast.info('This account no longer exists. Please sign in again.', 'account-off-outline'));
  }, [profileMissing, expectSignOut]);

  useEffect(() => {
    void flushUploads();
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && useUploadQueue.getState().items.some((i) => i.status === 'pending')) void flushUploads();
    });
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void flushUploads();
    });
    const interval = setInterval(() => {
      if (useUploadQueue.getState().items.some((i) => i.status === 'pending')) void flushUploads();
    }, 60_000);
    const unsubscribeUploaded = onUploaded(() => {
      for (const key of [qk.feed, qk.myActivitiesAll, qk.statsAll, qk.records, qk.myChallenges, qk.myExpeditions, qk.achievements, ['me'], qk.notifications, qk.unreadCount]) {
        client.invalidateQueries({ queryKey: key });
      }
    });
    return () => {
      unsubscribeNet();
      appState.remove();
      clearInterval(interval);
      unsubscribeUploaded();
    };
  }, [client]);
  return null;
}

/** Side effects that must run for the whole app lifetime. Renders nothing. */
export function AppRuntime() {
  const { userId } = useAuth();
  const hydrated = useRecording((s) => s.hydrated);

  // A session restored after the app was killed is paused at the moment it was interrupted.
  useEffect(() => {
    if (hydrated) useRecording.getState().recover();
  }, [hydrated]);

  return userId ? <SignedInRuntime key={userId} /> : null;
}
