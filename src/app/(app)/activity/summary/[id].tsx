import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Hero } from '@/components/brand/Hero';
import { Button, Card, Chip, ErrorState, Icon, InlineNotice, LoadingState, ProgressBar, Screen, Section, Text, toIconName } from '@/components/ui';
import { ACTIVITY_TYPE_META } from '@/domain/activity-types';
import { progressFraction } from '@/domain/progress';
import { formatDuration } from '@/domain/units';
import { useActivity, useActivityRoute, useActivitySummary } from '@/features/activities/api';
import { RouteMap } from '@/features/activities/components/RouteMap';
import { StatGrid } from '@/features/activities/components/StatGrid';
import { useUserId } from '@/features/auth/AuthProvider';
import { TIER_COLORS } from '@/features/gamification/api';
import { Celebration, type CelebrationItem } from '@/features/gamification/components';
import { useUnits } from '@/hooks/useUnits';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ActivitySummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const userId = useUserId();
  const summary = useActivitySummary(id);
  const activity = useActivity(id, userId);
  const route = useActivityRoute(id, true);
  const [celebrated, setCelebrated] = useState(false);

  const s = summary.data;
  const celebration = useMemo<CelebrationItem[]>(() => {
    if (!s || s.replayed) return [];
    const items: CelebrationItem[] = [];
    if (s.level_after > s.level_before) items.push({ icon: 'arrow-up-bold-circle', title: `Level ${s.level_after}!`, subtitle: 'You levelled up. Keep exploring.', color: colors.secondary });
    for (const a of s.achievements) items.push({ icon: a.icon, title: a.title, subtitle: 'Achievement unlocked', color: TIER_COLORS[a.tier as keyof typeof TIER_COLORS] });
    for (const j of s.journeys) {
      if (j.completed_now) items.push({ icon: 'map-marker-check', title: `${j.journey_title} complete!`, subtitle: 'You reached the end of the journey.' });
      for (const cp of j.checkpoints) items.push({ icon: 'flag-variant', title: cp, subtitle: `Checkpoint reached on ${j.journey_title}` });
    }
    for (const c of s.challenges) if (c.completed_now) items.push({ icon: 'flag-checkered', title: c.title, subtitle: 'Challenge complete!' });
    for (const t of s.themes) items.push({ icon: 'palette', title: t.name, subtitle: 'New theme unlocked' });
    return items;
  }, [s, colors.secondary]);

  if (summary.isPending || activity.isPending) return <LoadingState label="Tallying your progress…" />;
  if (summary.isError || activity.isError || !activity.data) {
    return (
      <Screen>
        <ErrorState message="We saved your activity but could not load the summary." onRetry={() => void summary.refetch()} />
        <Button label="Go home" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const a = activity.data.activity;
  const meta = ACTIVITY_TYPE_META[a.type];
  const speed = units.speedFor(a.type, a.avg_speed_mps ?? 0);
  const points = (route.data ?? []).map((p) => ({ lat: p.lat, lng: p.lng, segment: p.segment }));

  const share = async () => {
    const parts = [`${a.title} on QuestFit`, `${meta.label}${a.distance_m > 0 ? ` · ${units.distance(a.distance_m)}` : ''} · ${formatDuration(a.moving_time_s)}`];
    if (speed) parts.push(`${speed.label}: ${speed.value}`);
    if (s?.achievements.length) parts.push(`Unlocked: ${s.achievements.map((x) => x.title).join(', ')}`);
    for (const c of s?.challenges ?? []) if (c.completed_now) parts.push(`Completed the "${c.title}" challenge`);
    await Share.share({ message: parts.join('\n') });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Celebration items={celebrated ? [] : celebration} onClose={() => setCelebrated(true)} />
      <Hero style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name={toIconName(meta.icon)} size={22} color={colors.onHero} />
          <Text variant="overline" tone="onHeroMuted">
            {meta.label} saved
          </Text>
        </View>
        <Text variant="display" tone="onHero">
          {a.title}
        </Text>
        {s && s.xp_gained > 0 ? (
          <Chip label={`+${s.xp_gained} XP`} icon="star-four-points" tone="secondary" />
        ) : null}
      </Hero>

      {!a.is_eligible ? <InlineNotice tone="warning" title="Not counted toward progress" message={a.ineligible_reason ?? undefined} /> : null}

      <Card style={{ marginTop: spacing.lg }}>
        <StatGrid
          large
          columns={a.distance_m > 0 && speed ? 3 : 2}
          stats={[
            ...(a.distance_m > 0 ? [{ label: 'Distance', value: units.distance(a.distance_m) }] : []),
            { label: 'Moving time', value: formatDuration(a.moving_time_s) },
            ...(speed ? [{ label: speed.label, value: speed.value }] : []),
          ]}
        />
      </Card>

      {points.length > 1 ? <RouteMap points={points} height={220} style={{ marginTop: spacing.lg }} /> : null}

      {s?.personal_records.length ? (
        <Section title="Personal records">
          {s.personal_records.map((r) => (
            <Animated.View key={r.kind} entering={FadeInDown}>
              <Card tone="accent" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Icon name="star-circle" size={28} color={colors.secondaryText} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {r.kind === 'longest_distance' ? `Longest ${meta.label.toLowerCase()}` : r.kind === 'longest_duration' ? `Longest ${meta.label.toLowerCase()} by time` : `Fastest ${meta.label.toLowerCase()} pace`}
                  </Text>
                  <Text variant="small" tone="muted">
                    {r.kind === 'longest_distance' ? units.distance(r.value) : r.kind === 'longest_duration' ? formatDuration(r.value) : units.speedFor(a.type, r.value)?.value ?? ''}
                    {r.previous !== null ? ` · previous best ${r.kind === 'longest_distance' ? units.distance(r.previous) : r.kind === 'longest_duration' ? formatDuration(r.previous) : units.speedFor(a.type, r.previous)?.value ?? ''}` : ' · your first one!'}
                  </Text>
                </View>
              </Card>
            </Animated.View>
          ))}
        </Section>
      ) : null}

      {s?.challenges.length ? (
        <Section title="Challenge progress">
          {s.challenges.map((c) => {
            const fraction = progressFraction(c.progress_value, c.target_value);
            return (
              <Card key={c.challenge_id} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.challenge_id } })} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {c.title}
                  </Text>
                  {c.completed_now ? <Chip label="Completed!" icon="check-decagram" size="sm" tone="accent" /> : null}
                </View>
                <Text variant="small" tone="accent">
                  +{units.metric(c.metric, c.value)}
                  {c.mode === 'collaborative' ? ' to the community goal' : c.mode === 'team' ? ' for your team' : ''}
                </Text>
                {c.target_value ? <ProgressBar value={fraction} height={8} /> : null}
                <Text variant="caption" tone="muted" tabular>
                  {units.metric(c.metric, c.progress_value)}
                  {c.target_value ? ` of ${units.metric(c.metric, c.target_value)}` : ''}
                  {c.mode === 'collaborative' || c.mode === 'team' ? ` · you: ${units.metric(c.metric, c.personal_value)}` : ''}
                </Text>
              </Card>
            );
          })}
        </Section>
      ) : null}

      {s?.journeys.length ? (
        <Section title="Journey progress">
          {s.journeys.map((j) => (
            <Card key={j.expedition_id} onPress={() => router.push({ pathname: '/expedition/[id]', params: { id: j.expedition_id } })} style={{ gap: spacing.sm }}>
              <Text variant="bodyStrong">{j.journey_title}</Text>
              <Text variant="small" tone="accent">
                +{units.distance(j.value_m)} {j.mode === 'group' ? 'for your party' : 'travelled'}
              </Text>
              <ProgressBar value={progressFraction(j.progress_m, j.total_m)} height={8} />
              <Text variant="caption" tone="muted" tabular>
                {units.distance(Math.min(j.progress_m, j.total_m))} of {units.distance(j.total_m, 0)}
              </Text>
              {j.checkpoints.map((cp) => (
                <Chip key={cp} label={`Reached ${cp}`} icon="flag-variant" size="sm" tone="secondary" />
              ))}
            </Card>
          ))}
        </Section>
      ) : null}

      {s?.achievements.length || s?.themes.length ? (
        <Section title="Unlocked">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {s.achievements.map((x) => (
              <Chip key={x.id} label={x.title} icon={toIconName(x.icon)} tone="secondary" />
            ))}
            {s.themes.map((t) => (
              <Chip key={t.id} label={`${t.name} theme`} icon="palette" tone="accent" onPress={() => router.push('/settings/themes')} />
            ))}
          </View>
        </Section>
      ) : null}

      {s && s.challenges.length === 0 && s.journeys.length === 0 && a.is_eligible ? (
        <InlineNotice
          tone="info"
          icon="lightbulb-on-outline"
          title="Make every kilometre count"
          message="Join a challenge or start a journey and your future activities will move you forward automatically."
          action={<Button label="Explore" size="sm" variant="outline" onPress={() => router.replace('/explore')} />}
        />
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
        <Button label="Share" icon="share-variant" variant="outline" onPress={() => void share()} fullWidth />
        <Button label="View activity" variant="secondary" onPress={() => router.replace({ pathname: '/activity/[id]', params: { id } })} fullWidth />
        <Button label="Done" onPress={() => router.replace('/')} fullWidth />
      </View>
    </Screen>
  );
}
