import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePreferences } from '@/state/preferences-store';

function enabled(): boolean {
  return Platform.OS !== 'web' && usePreferences.getState().hapticsEnabled;
}

function run(effect: () => Promise<void>) {
  if (!enabled()) return;
  effect().catch(() => undefined);
}

export const haptics = {
  tap: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
