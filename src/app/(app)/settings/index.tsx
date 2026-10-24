import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Divider, ListRow, Screen, ScreenHeader, Section, SegmentedControl, SwitchRow, Text, toast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/api';
import { enablePushNotifications, pushSupport } from '@/features/notifications/push';
import { useMyProfile, useUpdateSettings } from '@/features/profile/api';
import { useUploadQueue } from '@/features/recording/upload-queue';
import { toUserMessage } from '@/lib/errors';
import { type Appearance, usePreferences } from '@/state/preferences-store';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function SettingsScreen() {
  const { spacing } = useAppTheme();
  const { expectSignOut } = useAuth();
  const me = useMyProfile();
  const updateSettings = useUpdateSettings();
  const appearance = usePreferences((s) => s.appearance);
  const setAppearance = usePreferences((s) => s.setAppearance);
  const haptics = usePreferences((s) => s.hapticsEnabled);
  const setHaptics = usePreferences((s) => s.setHapticsEnabled);
  const resetPreferences = usePreferences((s) => s.reset);
  const pending = useUploadQueue((s) => s.items.length);
  const [busy, setBusy] = useState(false);
  const settings = me.data?.settings;

  const togglePush = async (value: boolean) => {
    if (!value) return updateSettings.mutate({ notify_push: false });
    const support = pushSupport();
    if (support !== 'supported') {
      updateSettings.mutate({ notify_push: true });
      toast.info(support === 'web' ? 'Push notifications are available in the mobile app. In-app notifications are on.' : support === 'simulator' ? 'Push needs a physical device. In-app notifications are on.' : 'Push is not configured for this build yet. In-app notifications are on.');
      return;
    }
    const result = await enablePushNotifications().catch((e: unknown) => {
      toast.error(toUserMessage(e));
      return 'denied' as const;
    });
    updateSettings.mutate({ notify_push: result === 'enabled' });
    if (result === 'denied') toast.info('Allow notifications for QuestFit in your device settings to receive push alerts.');
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <Section title="Account">
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListRow title="Edit profile" subtitle="Name, username, photo, bio" icon="account-edit-outline" onPress={() => router.push('/settings/profile')} />
          <Divider />
          <ListRow title="Privacy" subtitle="Profile, activities and route sharing" icon="shield-lock-outline" onPress={() => router.push('/settings/privacy')} />
          <Divider />
          <ListRow title="Blocked people" icon="block-helper" onPress={() => router.push('/settings/blocked')} />
          <Divider />
          <ListRow title="Account & data" subtitle="Password, delete account" icon="database-cog-outline" onPress={() => router.push('/settings/account')} />
        </Card>
      </Section>

      <Section title="Units">
        <SegmentedControl
          options={[
            { value: 'metric', label: 'Kilometres' },
            { value: 'imperial', label: 'Miles' },
          ]}
          value={settings?.measurement_system ?? 'metric'}
          onChange={(v) => updateSettings.mutate({ measurement_system: v }, { onError: (e) => toast.error(toUserMessage(e)) })}
          accessibilityLabel="Measurement system"
        />
        <Text variant="caption" tone="subtle">
          Distances are stored precisely in metres; switching units only changes how they are shown.
        </Text>
      </Section>

      <Section title="Appearance">
        <SegmentedControl<Appearance>
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={appearance}
          onChange={setAppearance}
          accessibilityLabel="Colour scheme"
        />
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListRow title="Themes" subtitle="Equip themes you have unlocked" icon="palette-outline" onPress={() => router.push('/settings/themes')} />
          <Divider />
          <SwitchRow title="Haptic feedback" icon="vibrate" value={haptics} onValueChange={setHaptics} />
        </Card>
      </Section>

      <Section title="Notifications">
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <SwitchRow title="Push notifications" subtitle="Friend requests, invitations, checkpoints and unlocks. In-app notifications are always on." icon="bell-ring-outline" value={settings?.notify_push ?? false} onValueChange={(v) => void togglePush(v)} />
        </Card>
      </Section>

      <Section title="Data on this device">
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListRow title="Pending uploads" subtitle={pending ? `${pending} waiting` : 'Everything is synced'} icon="cloud-upload-outline" onPress={() => router.push('/uploads')} />
        </Card>
      </Section>

      <Section>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListRow
            title={busy ? 'Signing out…' : 'Sign out'}
            icon="logout"
            destructive
            chevron={false}
            onPress={async () => {
              if (pending) {
                toast.info('You have activities waiting to upload. They stay on this device and upload after you sign back in.');
              }
              setBusy(true);
              expectSignOut();
              try {
                await signOut();
                resetPreferences();
              } catch (e) {
                toast.error(toUserMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      </Section>
      <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
        <Text variant="caption" tone="subtle">
          QuestFit {Constants.expoConfig?.version ?? ''}
        </Text>
      </View>
    </Screen>
  );
}
