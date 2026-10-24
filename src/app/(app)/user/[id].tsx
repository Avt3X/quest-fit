import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Hero } from '@/components/brand/Hero';
import { Avatar, Button, Card, Chip, ErrorState, Icon, InlineNotice, ListRow, LoadingState, Screen, ScreenHeader, Section, Text, confirm, toIconName, toast } from '@/components/ui';
import { activeStreak, localDateKey } from '@/domain/progress';
import { formatDurationShort } from '@/domain/units';
import { useUserActivities } from '@/features/activities/api';
import { ActivityRow } from '@/features/activities/components/ActivityCard';
import { StatTile } from '@/features/activities/components/StatGrid';
import { useUserId } from '@/features/auth/AuthProvider';
import { TIER_COLORS } from '@/features/gamification/api';
import { usePublicProfile } from '@/features/profile/api';
import { useBlockUser, useRemoveFriend, useUnblockUser } from '@/features/social/api';
import { FriendAction } from '@/features/social/components';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const viewerId = useUserId();
  const profile = usePublicProfile(id);
  const activities = useUserActivities(id);
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const remove = useRemoveFriend();

  if (id === viewerId) return <Redirect href="/profile" />;
  if (profile.isPending) return <LoadingState />;
  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <ScreenHeader title="Profile" />
        <ErrorState message={toUserMessage(profile.error, 'This profile is not available.')} />
      </Screen>
    );
  }
  const p = profile.data;
  const today = localDateKey(new Date());

  const onBlock = async () => {
    const ok = await confirm({
      title: `Block ${p.profile.display_name}?`,
      message: 'You will no longer see each other’s profiles, activities or comments, and any friendship or pending invitations are removed. They are not notified.',
      confirmLabel: 'Block',
      destructive: true,
    });
    if (ok) block.mutate(id, { onSuccess: () => toast.info('User blocked'), onError: (e) => toast.error(toUserMessage(e)) });
  };

  const onRemove = async () => {
    const ok = await confirm({ title: 'Remove friend?', message: `${p.profile.display_name} will no longer see your friends-only activities.`, confirmLabel: 'Remove', destructive: true });
    if (ok) remove.mutate(id, { onError: (e) => toast.error(toUserMessage(e)) });
  };

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <ScreenHeader title={p.profile.display_name} subtitle={`@${p.profile.username}`} />
      <Hero style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={p.profile.display_name} uri={p.profile.avatar_url} size={84} ring={colors.accent} level={p.level?.level} />
        {p.profile.bio ? (
          <Text variant="small" tone="onHero" align="center">
            {p.profile.bio}
          </Text>
        ) : null}
        <Text variant="caption" tone="onHeroMuted">
          Level {p.level?.level ?? 1} · joined {new Date(p.profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        {p.relationship !== 'blocked' ? <FriendAction userId={id} relationship={p.relationship === 'self' ? 'friends' : p.relationship} /> : null}
      </Hero>

      {p.relationship === 'blocked' ? (
        <View style={{ marginTop: spacing.lg }}>
          <InlineNotice tone="warning" title="You blocked this person" action={<Button label="Unblock" size="sm" variant="outline" onPress={() => unblock.mutate(id)} />} />
        </View>
      ) : null}

      {p.can_view_details && p.stats ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
          <StatTile label="Distance" value={units.compact(Number(p.stats.total_distance_m))} icon="map-marker-distance" tone="accent" />
          <StatTile label="Time" value={formatDurationShort(Number(p.stats.total_moving_time_s))} icon="timer-outline" />
          <StatTile label="Activities" value={String(p.stats.activity_count)} icon="lightning-bolt" />
          <StatTile label="Day streak" value={String(activeStreak('daily', p.stats.daily_streak_days, p.stats.daily_streak_last_date, today))} icon="fire" />
        </View>
      ) : (
        <Card tone="muted" style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Icon name="lock-outline" size={22} color={colors.textMuted} />
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {p.profile.profile_visibility === 'friends' ? 'Only friends can see this person’s stats and activities.' : 'This profile is private.'}
          </Text>
        </Card>
      )}

      {p.shared_challenges.length ? (
        <Section title="Challenges you share">
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {p.shared_challenges.map((c) => (
              <ListRow key={c.id} title={c.title} subtitle={`Ends ${new Date(c.ends_at).toLocaleDateString()}`} icon="flag-outline" onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })} />
            ))}
          </Card>
        </Section>
      ) : null}

      {p.achievements?.length ? (
        <Section title="Achievements">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {p.achievements.map((a) => (
              <Chip key={a.id} label={a.title} icon={toIconName(a.icon)} size="sm" tone="secondary" style={{ borderColor: TIER_COLORS[a.tier as keyof typeof TIER_COLORS] }} />
            ))}
          </View>
        </Section>
      ) : null}

      {p.can_view_details ? (
        <Section title="Recent activities">
          {activities.data?.length ? (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {activities.data.map((a) => (
                <ActivityRow key={a.id} id={a.id} type={a.type} title={a.title} startedAt={a.started_at} distanceM={a.distance_m} movingTimeS={a.moving_time_s} isEligible={a.is_eligible} />
              ))}
            </Card>
          ) : (
            <Text variant="small" tone="muted">
              No activities you can see yet.
            </Text>
          )}
        </Section>
      ) : null}

      <View style={{ gap: spacing.xs, marginTop: spacing.xxl }}>
        {p.relationship === 'friends' ? <Button label="Remove friend" icon="account-remove-outline" variant="ghost" onPress={() => void onRemove()} /> : null}
        {p.relationship !== 'blocked' ? <Button label="Block" icon="block-helper" variant="ghost" onPress={() => void onBlock()} /> : null}
      </View>
    </Screen>
  );
}
