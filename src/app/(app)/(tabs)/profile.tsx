import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Hero } from '@/components/brand/Hero';
import { Avatar, Button, Card, CardSkeleton, EmptyState, IconButton, Screen, Section, Text } from '@/components/ui';
import { activeStreak, localDateKey } from '@/domain/progress';
import { formatDurationShort } from '@/domain/units';
import { useMyActivities, usePersonalRecords } from '@/features/activities/api';
import { ActivityRow } from '@/features/activities/components/ActivityCard';
import { StatTile } from '@/features/activities/components/StatGrid';
import { useUserId } from '@/features/auth/AuthProvider';
import { useMyChallenges } from '@/features/challenges/api';
import { useAchievementProgress } from '@/features/gamification/api';
import { AchievementBadge, LevelCard } from '@/features/gamification/components';
import { useJourneys, useMyExpeditions } from '@/features/journeys/api';
import { JourneyCard } from '@/features/journeys/components';
import { useMyProfile, useThemes, useUnlockedThemes } from '@/features/profile/api';
import { useUnits } from '@/hooks/useUnits';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ProfileScreen() {
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const userId = useUserId();
  const me = useMyProfile();
  const achievements = useAchievementProgress();
  const themes = useThemes();
  const unlocked = useUnlockedThemes();
  const expeditions = useMyExpeditions();
  const journeys = useJourneys();
  const challenges = useMyChallenges();
  const recent = useMyActivities(userId, { types: [], range: 'all' });
  const records = usePersonalRecords();

  if (!me.data) return <Screen><CardSkeleton lines={5} /></Screen>;
  const { profile, stats, xp } = me.data;
  const today = localDateKey(new Date());
  const daily = activeStreak('daily', stats.daily_streak_days, stats.daily_streak_last_date, today);
  const weekly = activeStreak('weekly', stats.weekly_streak_weeks, stats.weekly_streak_last_week, today);
  const earned = (achievements.data ?? []).filter((a) => a.earned_at);
  const completedJourneys = (expeditions.data ?? []).filter((e) => e.expedition.status === 'completed');
  const activeChallenges = (challenges.data ?? []).filter((c) => new Date(c.challenge.ends_at) > new Date()).length;
  const recentRows = recent.data?.pages[0]?.slice(0, 5) ?? [];
  const unlockedCount = unlocked.data?.length ?? 0;
  const equipped = themes.data?.find((t) => t.id === profile.equipped_theme_id);

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()} testID="profile-screen">
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
        <IconButton icon="account-multiple-outline" accessibilityLabel="Friends" variant="filled" onPress={() => router.push('/friends')} />
        <IconButton icon="cog-outline" accessibilityLabel="Settings" variant="filled" onPress={() => router.push('/settings')} />
      </View>
      <Hero style={{ marginTop: spacing.sm, alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={profile.display_name} uri={profile.avatar_url} size={92} ring={colors.accent} level={xp.level} />
        <Text variant="title" tone="onHero" align="center">
          {profile.display_name}
        </Text>
        <Text variant="small" tone="onHeroMuted">
          @{profile.username}
          {equipped ? ` · ${equipped.name} theme` : ''}
        </Text>
        {profile.bio ? (
          <Text variant="small" tone="onHero" align="center">
            {profile.bio}
          </Text>
        ) : null}
        <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
          <LevelCard xpTotal={Number(xp.xp_total)} />
        </View>
      </Hero>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
        <StatTile label="Total distance" value={units.compact(Number(stats.total_distance_m))} icon="map-marker-distance" tone="accent" />
        <StatTile label="Moving time" value={formatDurationShort(Number(stats.total_moving_time_s))} icon="timer-outline" />
        <StatTile label="Activities" value={stats.activity_count.toLocaleString('en-US')} icon="lightning-bolt" />
        <StatTile label="Day streak" value={`${daily}`} icon="fire" />
        <StatTile label="Week streak" value={`${weekly}`} icon="calendar-check" />
        <StatTile label="Active challenges" value={`${activeChallenges}`} icon="flag-outline" />
      </View>
      <Text variant="caption" tone="subtle" style={{ marginTop: spacing.sm }}>
        Streaks count days (or weeks) with at least one activity of 10+ minutes. Longest daily streak: {stats.longest_daily_streak}. Rest days never reset journeys or challenges.
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        <Button label="Edit profile" icon="pencil" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push('/settings/profile')} />
        <Button label="Stats & history" icon="chart-bar" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push('/history')} />
      </View>

      <Section title={`Achievements · ${earned.length}/${achievements.data?.length ?? 0}`} action={<Button label="All" variant="ghost" size="sm" onPress={() => router.push('/achievements')} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(achievements.data ?? [])
            .slice()
            .sort((a, b) => Number(!!b.earned_at) - Number(!!a.earned_at))
            .slice(0, 10)
            .map((a) => (
              <AchievementBadge key={a.id} achievement={a} size={56} />
            ))}
        </ScrollView>
      </Section>

      <Section title="Themes" action={<Button label="Gallery" variant="ghost" size="sm" onPress={() => router.push('/settings/themes')} />}>
        <Card onPress={() => router.push('/settings/themes')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flexDirection: 'row' }}>
            {(themes.data ?? []).slice(0, 5).map((t, i) => (
              <View key={t.id} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.palette.accent, marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: colors.surface }} />
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">
              {unlockedCount} of {themes.data?.length ?? 0} unlocked
            </Text>
            <Text variant="small" tone="muted">
              Earn new looks with distance milestones, levels and journeys.
            </Text>
          </View>
        </Card>
      </Section>

      <Section title="Journeys">
        {(expeditions.data ?? []).filter((e) => e.member.is_active).map((e) => {
          const j = journeys.data?.find((x) => x.id === e.expedition.journey_id);
          return j ? <JourneyCard key={e.expedition.id} journey={j} expedition={e.expedition} /> : null;
        })}
        {completedJourneys.length ? (
          <Text variant="small" tone="muted">
            Completed: {completedJourneys.map((e) => journeys.data?.find((j) => j.id === e.expedition.journey_id)?.title).filter(Boolean).join(', ')}
          </Text>
        ) : null}
        {!(expeditions.data ?? []).length ? <Button label="Choose a journey" icon="map-search-outline" variant="outline" onPress={() => router.push('/journeys')} /> : null}
      </Section>

      {records.data?.length ? (
        <Section title="Personal records">
          <Card style={{ gap: spacing.sm }}>
            {records.data.map((r) => (
              <View key={r.type} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodyStrong" style={{ textTransform: 'capitalize' }}>
                  {r.type.replace('_', ' ')}
                </Text>
                <Text variant="small" tone="muted" tabular>
                  {r.longest_distance ? `Longest ${units.distance(Number(r.longest_distance.value))}` : ''}
                  {r.longest_duration ? ` · ${formatDurationShort(Number(r.longest_duration.value))}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Recent activities" action={<Button label="History" variant="ghost" size="sm" onPress={() => router.push('/history')} />}>
        {recentRows.length ? (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {recentRows.map((a) => (
              <ActivityRow key={a.id} id={a.id} type={a.type} title={a.title} startedAt={a.started_at} distanceM={a.distance_m} movingTimeS={a.moving_time_s} isEligible={a.is_eligible} />
            ))}
          </Card>
        ) : (
          <EmptyState compact icon="run" title="No activities yet" message="Your history will appear here." actionLabel="Record one" onAction={() => router.push('/record')} />
        )}
      </Section>
    </Screen>
  );
}
