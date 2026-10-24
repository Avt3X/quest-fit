import { View } from 'react-native';

import { VisibilityPicker } from '@/components/VisibilityPicker';
import { Card, InlineNotice, LoadingState, Screen, ScreenHeader, Section, SwitchRow, Text, toast } from '@/components/ui';
import { useMyProfile, useUpdateProfile, useUpdateSettings } from '@/features/profile/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function PrivacyScreen() {
  const { spacing } = useAppTheme();
  const me = useMyProfile();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();
  if (!me.data) return <LoadingState />;
  const { profile, settings } = me.data;
  const onError = (e: unknown) => toast.error(toUserMessage(e));

  return (
    <Screen>
      <ScreenHeader title="Privacy" subtitle="Visibility changes apply immediately to everything you have already shared." />
      <Section title="Profile & stats">
        <VisibilityPicker kind="profile" value={profile.profile_visibility} onChange={(v) => updateProfile.mutate({ profile_visibility: v }, { onError })} />
        <Text variant="caption" tone="subtle">
          Your name, username, photo and level stay visible in challenges you join so leaderboards work. Private profiles never appear in search, feeds or global leaderboards, and nobody else can see their activities.
        </Text>
      </Section>
      <Section title="New activities">
        <VisibilityPicker value={settings.default_activity_visibility} onChange={(v) => updateSettings.mutate({ default_activity_visibility: v }, { onError })} />
        <Text variant="caption" tone="subtle">
          You can still change visibility for each activity. Private activities count toward your challenges and journeys, but only your total is visible to other participants.
        </Text>
      </Section>
      <Section title="Routes & location">
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <SwitchRow
            title="Share route maps"
            subtitle="Show a simplified map of new GPS activities to people who can see them."
            icon="map-outline"
            value={settings.share_routes}
            onValueChange={(v) => updateSettings.mutate({ share_routes: v }, { onError })}
          />
          <SwitchRow
            title="Hide start and finish"
            subtitle="Removes points within 200 m of where you start and finish from shared maps."
            icon="shield-home-outline"
            value={settings.hide_route_endpoints}
            onValueChange={(v) => updateSettings.mutate({ hide_route_endpoints: v }, { onError })}
          />
        </Card>
        <View style={{ gap: spacing.sm }}>
          <InlineNotice
            tone="info"
            icon="map-marker-radius-outline"
            title="How your location is used"
            message="Precise GPS points are only collected during a recording, are visible only to you, and are kept until you delete the route or the activity. Shared maps are simplified copies. QuestFit never sells or shares location data with third parties."
          />
          <Text variant="caption" tone="subtle">
            Route-sharing settings apply to activities recorded after the change. Use “Remove GPS route” on any activity to delete its points permanently.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}
