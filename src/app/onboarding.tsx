import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { LogoMark } from '@/components/brand/Hero';
import { VisibilityPicker } from '@/components/VisibilityPicker';
import { Button, Card, Chip, ErrorState, Icon, InlineNotice, LoadingState, ProgressBar, Screen, SegmentedControl, SwitchRow, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType, type Visibility } from '@/domain/activity-types';
import { deviceTimeZone } from '@/domain/periods';
import type { MeasurementSystem } from '@/domain/units';
import { useUserId } from '@/features/auth/AuthProvider';
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import { type MyProfile, useMyProfile, useUpdateProfile, useUpdateSettings } from '@/features/profile/api';
import { useUsernameStatus } from '@/features/profile/useUsernameStatus';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { profileSchema } from '@/validation/schemas';

const GOALS = ['Get consistent', 'Run my first 5K', 'Train for a race', 'Explore new places', 'Lose weight', 'Have fun with friends'];
const STEPS = ['profile', 'activities', 'units', 'privacy'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const me = useMyProfile();
  if (me.isError) return <ErrorState message="We could not load your profile. Check your connection." onRetry={() => void me.refetch()} />;
  if (!me.data) return <LoadingState label="Preparing your profile…" />;
  return <OnboardingFlow profile={me.data.profile} />;
}

function OnboardingFlow({ profile }: { profile: MyProfile['profile'] }) {
  const { spacing, colors } = useAppTheme();
  const userId = useUserId();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();

  const [step, setStep] = useState<Step>('profile');
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const usernameState = useUsernameStatus(username, profile.username);
  const [types, setTypes] = useState<ActivityType[]>(['run', 'walk']);
  const [goal, setGoal] = useState<string | null>(null);
  const [system, setSystem] = useState<MeasurementSystem>('metric');
  const [profileVisibility, setProfileVisibility] = useState<Visibility>('public');
  const [activityVisibility, setActivityVisibility] = useState<Visibility>('friends');
  const [hideEndpoints, setHideEndpoints] = useState(true);
  const [saving, setSaving] = useState(false);

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]);

  const finish = async () => {
    const parsed = profileSchema.safeParse({ displayName, username });
    if (!parsed.success) {
      setStep('profile');
      toast.error(parsed.error.issues[0]?.message ?? 'Check your profile details.');
      return;
    }
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        measurement_system: system,
        default_activity_visibility: activityVisibility,
        hide_route_endpoints: hideEndpoints,
        timezone: deviceTimeZone(),
      });
      await updateProfile.mutateAsync({
        display_name: parsed.data.displayName,
        username: parsed.data.username,
        avatar_url: avatarUrl,
        preferred_activity_types: types,
        fitness_goal: goal,
        profile_visibility: profileVisibility,
        onboarding_completed_at: new Date().toISOString(),
      });
      toast.success('Your quest begins!');
    } catch (e) {
      toast.error(toUserMessage(e));
      if (toUserMessage(e).includes('username')) setStep('profile');
    } finally {
      setSaving(false);
    }
  };

  const usernameHint = {
    idle: 'Friends find you by this name.',
    checking: 'Checking availability…',
    ok: 'Available',
    taken: undefined,
    invalid: undefined,
  }[usernameState];
  const usernameError = usernameState === 'taken' ? 'That username is taken.' : usernameState === 'invalid' ? '3–24 lowercase letters, numbers or underscores.' : undefined;

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md }}>
        <LogoMark size={36} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="caption" tone="muted">
            Step {index + 1} of {STEPS.length}
          </Text>
          <ProgressBar value={(index + 1) / STEPS.length} height={6} accessibilityLabel="Onboarding progress" />
        </View>
      </View>

      <Animated.View key={step} entering={FadeInRight.duration(260)} style={{ gap: spacing.lg, marginTop: spacing.xxl }}>
        {step === 'profile' ? (
          <>
            <Text variant="display">Who’s heading out?</Text>
            <AvatarPicker userId={userId} name={displayName} uri={avatarUrl} onUploaded={setAvatarUrl} />
            <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={50} autoComplete="name" />
            <TextField
              label="Username"
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              hint={usernameHint}
              error={usernameError}
            />
            <Button
              label="Continue"
              size="lg"
              iconRight="arrow-right"
              disabled={!displayName.trim() || usernameState === 'taken' || usernameState === 'invalid' || usernameState === 'checking'}
              onPress={next}
              fullWidth
            />
          </>
        ) : null}

        {step === 'activities' ? (
          <>
            <Text variant="display">What moves you?</Text>
            <Text variant="body" tone="muted">
              We use this to recommend challenges and journeys. Pick as many as you like.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {ACTIVITY_TYPES.map((t) => (
                <Chip
                  key={t}
                  label={ACTIVITY_TYPE_META[t].label}
                  icon={toIconName(ACTIVITY_TYPE_META[t].icon)}
                  selected={types.includes(t)}
                  onPress={() => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                />
              ))}
            </View>
            <Text variant="heading" style={{ marginTop: spacing.md }}>
              Any goal in mind? <Text tone="subtle">(optional)</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {GOALS.map((g) => (
                <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal((cur) => (cur === g ? null : g))} />
              ))}
            </View>
            <InlineNotice
              tone="info"
              icon="heart-pulse"
              title="Train at your own pace"
              message="QuestFit caps daily XP and celebrates consistency over volume. Rest days never cost you progress on journeys."
            />
            <StepButtons onNext={next} onSkip={next} />
          </>
        ) : null}

        {step === 'units' ? (
          <>
            <Text variant="display">Kilometres or miles?</Text>
            <SegmentedControl
              options={[
                { value: 'metric', label: 'Kilometres', icon: 'ruler' },
                { value: 'imperial', label: 'Miles', icon: 'ruler' },
              ]}
              value={system}
              onChange={setSystem}
              accessibilityLabel="Measurement system"
            />
            <Card tone="muted">
              <Text variant="body" tone="muted">
                A 5 km run shows as <Text variant="bodyStrong">{system === 'metric' ? '5.00 km' : '3.11 mi'}</Text> with pace in{' '}
                <Text variant="bodyStrong">{system === 'metric' ? 'min/km' : 'min/mi'}</Text>. You can switch at any time; your data is stored precisely either way.
              </Text>
            </Card>
            <StepButtons onNext={next} onSkip={next} />
          </>
        ) : null}

        {step === 'privacy' ? (
          <>
            <Text variant="display">Your privacy, your rules</Text>
            <Text variant="heading">Who can see your profile and stats?</Text>
            <VisibilityPicker kind="profile" value={profileVisibility} onChange={setProfileVisibility} />
            <Text variant="heading">Default visibility for new activities</Text>
            <VisibilityPicker value={activityVisibility} onChange={setActivityVisibility} />
            <Card>
              <SwitchRow
                title="Hide the start and end of my routes"
                subtitle="Removes 200 m around where you start and finish from shared maps, protecting your home and work."
                icon="shield-home"
                value={hideEndpoints}
                onValueChange={setHideEndpoints}
              />
            </Card>
            <Animated.View entering={FadeIn} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <Icon name="map-marker-radius" size={22} color={colors.accentText} />
              <Text variant="small" tone="muted" style={{ flex: 1 }}>
                We will only ask for location access when you start your first GPS recording.
              </Text>
            </Animated.View>
            <Button label="Start exploring" size="lg" icon="compass-rose" loading={saving} onPress={finish} fullWidth />
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

function StepButtons({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <Button label="Continue" size="lg" iconRight="arrow-right" onPress={onNext} fullWidth />
      <Button label="Skip for now" variant="ghost" onPress={onSkip} />
    </View>
  );
}
