import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { Hero } from '@/components/brand/Hero';
import { Avatar, Button, CardSkeleton, Chip, EmptyState, ErrorState, IconButton, Screen, Section, Text } from '@/components/ui';
import { ACTIVITY_TYPES } from '@/domain/activity-types';
import { startOfWeek } from '@/domain/periods';
import { activeStreak, localDateKey } from '@/domain/progress';
import { formatDurationShort } from '@/domain/units';
import { useActivityStats, useFeed } from '@/features/activities/api';
import { BarChart } from '@/features/activities/components/BarChart';
import { FeedItemView } from '@/features/activities/components/FeedItemView';
import { useUserId } from '@/features/auth/AuthProvider';
import { useMyChallenges } from '@/features/challenges/api';
import { ChallengeCard } from '@/features/challenges/components';
import { type AchievementProgress, nextAchievement, useAchievementProgress } from '@/features/gamification/api';
import { LevelCard, NextMilestoneCard } from '@/features/gamification/components';
import { FirstQuestCard, InvitationsCard, RecordingBanner, UploadsBanner } from '@/features/home/components';
import { useJourneys, useMyExpeditions } from '@/features/journeys/api';
import { JourneyCard } from '@/features/journeys/components';
import { useUnreadCount } from '@/features/notifications/api';
import { useMyProfile } from '@/features/profile/api';
import { useUnits } from '@/hooks/useUnits';
import { greeting } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function HomeScreen() {
  const { spacing } = useAppTheme();
  const userId = useUserId();
  const units = useUnits();
  const me = useMyProfile();
  const unread = useUnreadCount();
  const now = new Date();
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 6 * 86_400_000), [weekStart]);
  const week = useActivityStats({ from: weekStart, to: weekEnd, bucket: 'day', types: [...ACTIVITY_TYPES] });
  const challenges = useMyChallenges();
  const expeditions = useMyExpeditions();
  const journeys = useJourneys();
  const achievements = useAchievementProgress();
  const feed = useFeed();

  const totals = (week.data ?? []).reduce(
    (acc, b) => ({ distance: acc.distance + Number(b.distance_m), time: acc.time + Number(b.moving_time_s), count: acc.count + b.activity_count }),
    { distance: 0, time: 0, count: 0 },
  );
  const todayKey = localDateKey(now);
  const bars = (week.data ?? []).map((b, i) => ({
    key: b.bucket_start,
    label: DAY_LABELS[i] ?? '',
    value: Number(b.distance_m) || Number(b.moving_time_s) / 600,
    highlight: b.bucket_start === todayKey,
    description: `${new Date(`${b.bucket_start}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}: ${units.distance(Number(b.distance_m))}, ${b.activity_count} activities`,
  }));

  const stats = me.data?.stats;
  const daily = stats ? activeStreak('daily', stats.daily_streak_days, stats.daily_streak_last_date, todayKey) : 0;
  const weekly = stats ? activeStreak('weekly', stats.weekly_streak_weeks, stats.weekly_streak_last_week, todayKey) : 0;

  const activeChallenges = (challenges.data ?? [])
    .filter((c) => new Date(c.challenge.ends_at) > now)
    .sort((a, b) => new Date(a.challenge.ends_at).getTime() - new Date(b.challenge.ends_at).getTime());
  const activeExpeditions = (expeditions.data ?? []).filter((e) => e.member.is_active && e.expedition.status === 'active');
  const next = nextAchievement(achievements.data);
  const feedItems = feed.data?.pages.flat().slice(0, 6) ?? [];

  const formatAchievement = (a: AchievementProgress, v: number) =>
    a.rule_type === 'total_distance' || a.rule_type === 'single_activity_distance' ? units.distance(v, 0) : v.toLocaleString('en-US');

  const refreshing = me.isRefetching || week.isRefetching || feed.isRefetching;
  const onRefresh = () => {
    void me.refetch();
    void week.refetch();
    void challenges.refetch();
    void expeditions.refetch();
    void achievements.refetch();
    void feed.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="home-screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="muted">
            {greeting(now)}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {me.data?.profile.display_name ?? ' '}
          </Text>
        </View>
        <IconButton icon="trophy-outline" accessibilityLabel="Leaderboards" variant="filled" onPress={() => router.push('/leaderboards')} />
        <IconButton icon="bell-outline" accessibilityLabel={`Notifications${unread.data ? `, ${unread.data} unread` : ''}`} variant="filled" badge={unread.data} onPress={() => router.push('/notifications')} />
        <Avatar name={me.data?.profile.display_name ?? '?'} uri={me.data?.profile.avatar_url} size={42} />
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <RecordingBanner />
        <UploadsBanner />
      </View>

      <Hero style={{ marginTop: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text variant="overline" tone="onHeroMuted">
              This week
            </Text>
            <Text variant="metricLarge" tone="onHero" tabular accessibilityLabel={`${units.distance(totals.distance)} this week`}>
              {units.distanceValue(totals.distance, 1)}
              <Text variant="title" tone="onHeroMuted">
                {' '}
                {units.unit}
              </Text>
            </Text>
            <Text variant="small" tone="onHeroMuted">
              {formatDurationShort(totals.time)} · {totals.count} {totals.count === 1 ? 'activity' : 'activities'}
            </Text>
          </View>
          <View style={{ gap: spacing.xs, alignItems: 'flex-end' }}>
            <Chip label={`${daily} day streak`} icon="fire" size="sm" tone={daily > 0 ? 'secondary' : 'default'} />
            <Chip label={`${weekly} week streak`} icon="calendar-check" size="sm" tone={weekly > 0 ? 'accent' : 'default'} />
          </View>
        </View>
        {week.isPending ? null : <BarChart bars={bars} height={70} />}
        {me.data ? <LevelCard xpTotal={Number(me.data.xp.xp_total)} compact /> : null}
      </Hero>

      <Button label="Record an activity" icon="record-circle" size="lg" onPress={() => router.push('/record')} style={{ marginTop: spacing.lg }} fullWidth />

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <InvitationsCard />
        {stats ? (
          <FirstQuestCard hasActivity={stats.activity_count > 0} hasChallenge={(challenges.data ?? []).length > 0} hasJourney={(expeditions.data ?? []).length > 0} />
        ) : null}
        {next ? <NextMilestoneCard achievement={next} formatValue={formatAchievement} /> : null}
      </View>

      <Section title="Your journey" action={<Button label="All journeys" variant="ghost" size="sm" onPress={() => router.push('/journeys')} />}>
        {expeditions.isPending || journeys.isPending ? (
          <CardSkeleton />
        ) : activeExpeditions.length ? (
          activeExpeditions.map((e) => {
            const j = journeys.data?.find((x) => x.id === e.expedition.journey_id);
            return j ? <JourneyCard key={e.expedition.id} journey={j} expedition={e.expedition} /> : null;
          })
        ) : (
          <EmptyState compact icon="map-search-outline" title="No journey yet" message="Turn your kilometres into an adventure across the Alps, Japan or the fantasy road to the Ashen Peak." actionLabel="Choose a journey" onAction={() => router.push('/journeys')} />
        )}
      </Section>

      <Section title="Active challenges" action={<Button label="See all" variant="ghost" size="sm" onPress={() => router.push('/challenges')} />}>
        {challenges.isPending ? (
          <CardSkeleton />
        ) : challenges.isError ? (
          <ErrorState compact message="We could not load your challenges." onRetry={() => void challenges.refetch()} />
        ) : activeChallenges.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
            {activeChallenges.map((c) => (
              <ChallengeCard key={c.challenge.id} challenge={c.challenge} myValue={Number(c.participant.progress_value)} completed={!!c.participant.completed_at} width={270} />
            ))}
          </ScrollView>
        ) : (
          <EmptyState compact icon="flag-plus-outline" title="Find your next challenge" message="Weekly 25K, team battles, community goals and more." actionLabel="Explore challenges" onAction={() => router.push('/explore')} />
        )}
      </Section>

      <Section title="Friends’ activity" action={<Button label="Friends" variant="ghost" size="sm" onPress={() => router.push('/friends')} />}>
        {feed.isPending ? (
          <CardSkeleton lines={4} />
        ) : feed.isError ? (
          <ErrorState compact message="We could not load the feed." onRetry={() => void feed.refetch()} />
        ) : feedItems.length ? (
          <>
            {feedItems.map((item) => (
              <FeedItemView key={item.key} item={item} viewerId={userId} />
            ))}
            <Button label="Open full feed" variant="outline" onPress={() => router.push('/feed')} />
          </>
        ) : (
          <EmptyState compact icon="account-group-outline" title="Your feed is quiet" message="Add friends to see their runs, rides, achievements and challenge wins here." actionLabel="Find friends" onAction={() => router.push('/friends')} />
        )}
      </Section>
    </Screen>
  );
}
