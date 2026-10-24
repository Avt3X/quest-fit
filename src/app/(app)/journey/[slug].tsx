import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, ErrorState, Icon, InlineNotice, LoadingState, Screen, ScreenHeader, Section, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPE_META } from '@/domain/activity-types';
import { useJourney, useMyExpeditions, useStartExpedition } from '@/features/journeys/api';
import { JourneyMap } from '@/features/journeys/JourneyMap';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function JourneyDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const journey = useJourney(slug);
  const mine = useMyExpeditions();
  const start = useStartExpedition();
  const [partyName, setPartyName] = useState('');
  const [showGroup, setShowGroup] = useState(false);

  if (journey.isPending) return <LoadingState />;
  if (journey.isError || !journey.data) {
    return (
      <Screen>
        <ScreenHeader title="Journey" />
        <ErrorState message="This journey is not available." onRetry={() => void journey.refetch()} />
      </Screen>
    );
  }
  const j = journey.data;
  const active = mine.data?.find((e) => e.expedition.journey_id === j.id && e.member.is_active);
  const history = (mine.data ?? []).filter((e) => e.expedition.journey_id === j.id && e.expedition.status === 'completed');

  const begin = (mode: 'solo' | 'group') =>
    start.mutate(
      { journeyId: j.id, mode, name: mode === 'group' ? partyName.trim() || undefined : undefined },
      {
        onSuccess: (id) => {
          toast.success(mode === 'group' ? 'Your party is ready. Invite friends!' : 'Your journey begins!');
          router.replace({ pathname: '/expedition/[id]', params: { id } });
        },
        onError: (e) => toast.error(toUserMessage(e)),
      },
    );

  return (
    <Screen>
      <ScreenHeader title={j.title} subtitle={j.subtitle} />
      <JourneyMap id={j.slug} artKey={j.art_key} path={j.map_path} totalM={Number(j.total_distance_m)} progressM={0} checkpoints={j.checkpoints} unlockedIds={new Set()} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Chip label={units.distance(Number(j.total_distance_m), 0)} icon="map-marker-distance" size="sm" tone="accent" />
        <Chip label={`${j.checkpoints.length} checkpoints`} icon="flag-variant-outline" size="sm" />
        <Chip label={j.difficulty} icon="gauge" size="sm" />
        {j.is_fictional ? <Chip label="Original fantasy world" icon="auto-fix" size="sm" /> : <Chip label={j.region ?? 'Real places'} icon="earth" size="sm" />}
      </View>
      <Text variant="body" style={{ marginTop: spacing.lg }}>
        {j.description}
      </Text>
      {j.story_intro ? (
        <Card tone="muted" style={{ marginTop: spacing.md }}>
          <Text variant="body" tone="muted" style={{ fontStyle: 'italic' }}>
            {j.story_intro}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Text variant="smallStrong" tone="muted">
          Counts toward this journey
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {j.activity_types.map((t) => (
            <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} size="sm" />
          ))}
          {!j.allow_manual ? <Chip label="GPS only" icon="crosshairs-gps" size="sm" /> : null}
        </View>
        <Text variant="caption" tone="subtle">
          Only activities that start after you set out are counted. {j.is_fictional ? '' : 'Distances are approximate game values for the route.'}
        </Text>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
        {active ? (
          <Button label="Continue your journey" icon="arrow-right" size="lg" onPress={() => router.push({ pathname: '/expedition/[id]', params: { id: active.expedition.id } })} fullWidth />
        ) : (
          <>
            {j.supports_solo ? <Button label={history.length ? 'Travel it again (solo)' : 'Set out solo'} icon="walk" size="lg" loading={start.isPending && !showGroup} onPress={() => begin('solo')} fullWidth testID="start-solo" /> : null}
            {j.supports_group ? (
              showGroup ? (
                <Card style={{ gap: spacing.md }}>
                  <TextField label="Party name (optional)" value={partyName} onChangeText={setPartyName} maxLength={40} placeholder={`${j.title} Party`} />
                  <Button label="Create group expedition" icon="account-group" loading={start.isPending} onPress={() => begin('group')} fullWidth />
                </Card>
              ) : (
                <Button label="Travel with friends" icon="account-group" variant="outline" size="lg" onPress={() => setShowGroup(true)} fullWidth />
              )
            ) : null}
            {!j.supports_solo ? <InlineNotice tone="info" title="Group journey" message="This expedition can only be travelled as a crew. Every member’s distance moves the same marker." /> : null}
            <Button label="Have an invite code?" variant="ghost" onPress={() => router.push('/join')} />
          </>
        )}
      </View>

      <Section title="Route">
        {j.checkpoints.map((c, i) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={i === 0 ? 'home-variant-outline' : i === j.checkpoints.length - 1 ? 'flag-checkered' : 'map-marker-outline'} size={16} />
              </View>
              {i < j.checkpoints.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 24, backgroundColor: colors.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: spacing.md }}>
              <Text variant="bodyStrong">{c.name}</Text>
              <Text variant="caption" tone="accent">
                {units.distance(Number(c.distance_m), 0)}
                {c.xp_reward ? ` · +${c.xp_reward} XP` : ''}
              </Text>
              <Text variant="small" tone="muted">
                {c.description}
              </Text>
            </View>
          </View>
        ))}
        <Text variant="small" tone="muted">
          Finishing awards {j.completion_xp} XP{j.reward_theme_id ? ' and an exclusive theme' : ''}.
        </Text>
      </Section>
    </Screen>
  );
}
