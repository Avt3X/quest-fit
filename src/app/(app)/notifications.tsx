import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Button, EmptyState, ErrorState, Icon, type IconName, IconButton, LoadingState, Screen, ScreenHeader, Text } from '@/components/ui';
import { InvitationsCard } from '@/features/home/components';
import { type NotificationRow, useDeleteNotification, useMarkNotificationsRead, useNotifications } from '@/features/notifications/api';
import { relativeTime } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';

const ICONS: Record<NotificationRow['type'], IconName> = {
  friend_request: 'account-plus',
  friend_accepted: 'account-check',
  challenge_invite: 'email-open-outline',
  expedition_invite: 'email-open-outline',
  challenge_milestone: 'flag-variant',
  challenge_completed: 'flag-checkered',
  challenge_finished: 'podium',
  achievement_unlocked: 'trophy',
  journey_checkpoint: 'map-marker-check',
  journey_completed: 'map-check',
  level_up: 'arrow-up-bold-circle',
  theme_unlocked: 'palette',
  activity_reaction: 'hand-clap',
  activity_comment: 'comment-text-outline',
};

function target(n: NotificationRow): Href | null {
  const d = (n.data ?? {}) as Record<string, unknown>;
  if (typeof d.activity_id === 'string') return { pathname: '/activity/[id]', params: { id: d.activity_id } };
  if (typeof d.challenge_id === 'string') return { pathname: '/challenge/[id]', params: { id: d.challenge_id } };
  if (typeof d.expedition_id === 'string') return { pathname: '/expedition/[id]', params: { id: d.expedition_id } };
  if (typeof d.user_id === 'string') return { pathname: '/user/[id]', params: { id: d.user_id } };
  if (n.type === 'achievement_unlocked' || n.type === 'level_up') return '/achievements';
  if (n.type === 'theme_unlocked') return '/settings/themes';
  return null;
}

export default function NotificationsScreen() {
  const { spacing, colors, radii } = useAppTheme();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const remove = useDeleteNotification();
  const unread = (list.data ?? []).filter((n) => !n.read_at).length;
  const mutateRead = markRead.mutate;

  useEffect(() => {
    // Opening the screen counts as seeing the newest notifications.
    if (unread > 0) {
      const t = setTimeout(() => mutateRead(undefined), 1500);
      return () => clearTimeout(t);
    }
  }, [unread, mutateRead]);

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <ScreenHeader title="Notifications" right={unread ? <Button label="Mark all read" variant="ghost" size="sm" onPress={() => markRead.mutate(undefined)} /> : undefined} />
      <InvitationsCard />
      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState message="We could not load notifications." onRetry={() => void list.refetch()} />
        ) : list.data?.length ? (
          list.data.map((n) => {
            const href = target(n);
            const actor = (n as NotificationRow & { actor?: { display_name: string; avatar_url: string | null } | null }).actor;
            return (
              <View
                key={n.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingRight: spacing.xs,
                  borderRadius: radii.lg,
                  backgroundColor: n.read_at ? 'transparent' : colors.accentSoft,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${n.title}. ${n.body}. ${relativeTime(n.created_at)}${n.read_at ? '' : '. Unread'}`}
                  onPress={() => {
                    if (!n.read_at) markRead.mutate([n.id]);
                    if (href) router.push(href);
                  }}
                  style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, opacity: pressed ? 0.8 : 1 })}
                >
                  {actor ? (
                    <Avatar name={actor.display_name} uri={actor.avatar_url} size={40} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={ICONS[n.type]} size={20} color={colors.accentText} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text variant="small" tone="muted" numberOfLines={2}>
                      {n.body}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {relativeTime(n.created_at)}
                    </Text>
                  </View>
                </Pressable>
                <IconButton icon="close" size={16} accessibilityLabel="Dismiss notification" onPress={() => remove.mutate(n.id)} />
              </View>
            );
          })
        ) : (
          <EmptyState icon="bell-sleep-outline" title="All caught up" message="Friend requests, challenge updates, checkpoints and unlocks will show up here." />
        )}
      </View>
    </Screen>
  );
}
