// Push notifications are an optional transport on top of the in-app notification table. They need
// a development/production build, an EAS project id and (for delivery) the push-dispatch Edge
// Function. Without those, in-app notifications keep working and this module does nothing.
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useMyProfile } from '@/features/profile/api';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
}

export type PushSupport = 'supported' | 'web' | 'simulator' | 'not_configured';

export function pushSupport(): PushSupport {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulator';
  if (!env.easProjectId) return 'not_configured';
  return 'supported';
}

async function registerToken(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'QuestFit',
      importance: AndroidImportance.DEFAULT,
      lightColor: '#1FC99A',
    });
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId ?? undefined });
  const { error } = await supabase.rpc('register_push_token', { p_token: token.data, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  if (error) throw error;
}

/** Asks for permission (only call from an explicit user action) and registers the device. */
export async function enablePushNotifications(): Promise<'enabled' | 'denied' | PushSupport> {
  const support = pushSupport();
  if (support !== 'supported') return support;
  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!status.granted) return 'denied';
  await registerToken();
  return 'enabled';
}

function routeForData(data: Record<string, unknown>): string | null {
  if (typeof data.activity_id === 'string') return `/activity/${data.activity_id}`;
  if (typeof data.challenge_id === 'string') return `/challenge/${data.challenge_id}`;
  if (typeof data.expedition_id === 'string') return `/expedition/${data.expedition_id}`;
  if (typeof data.user_id === 'string') return `/user/${data.user_id}`;
  return '/notifications';
}

/** Re-registers silently when permission was already granted; routes taps on notifications. */
export function usePushRegistration() {
  const me = useMyProfile();
  const wantsPush = me.data?.settings.notify_push ?? false;
  useEffect(() => {
    if (!wantsPush || pushSupport() !== 'supported') return;
    Notifications.getPermissionsAsync()
      .then((p) => (p.granted ? registerToken() : undefined))
      .catch(() => undefined);
  }, [wantsPush]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = routeForData((response.notification.request.content.data ?? {}) as Record<string, unknown>);
      if (target) router.push(target as never);
    });
    return () => sub.remove();
  }, []);
}
