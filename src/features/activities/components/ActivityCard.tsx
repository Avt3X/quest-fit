import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar, Card, Chip, Icon, Text, toIconName } from '@/components/ui';
import { ACTIVITY_TYPE_META, type ActivityType, VISIBILITY_META, type Visibility } from '@/domain/activity-types';
import { parseRoutePreview } from '@/domain/geo';
import { formatDurationShort } from '@/domain/units';
import { useUnits } from '@/hooks/useUnits';
import { relativeTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import type { Actor, FeedActivity } from '../api';
import { useToggleReaction } from '../api';
import { RoutePreview } from './RoutePreview';

export function ActivityCard({ activity, actor, isMine }: { activity: FeedActivity; actor: Actor; isMine: boolean }) {
  const { colors, spacing } = useAppTheme();
  const units = useUnits();
  const toggle = useToggleReaction();
  const preview = parseRoutePreview(activity.route_preview);
  const meta = ACTIVITY_TYPE_META[activity.type];
  const speed = units.speedFor(activity.type, activity.avg_speed_mps);
  const reacted = toggle.isPending ? !activity.reacted : activity.reacted;
  const reactionCount = activity.reaction_count + (toggle.isPending ? (activity.reacted ? -1 : 1) : 0);

  const open = () => {
    haptics.tap();
    router.push({ pathname: '/activity/[id]', params: { id: activity.id } });
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${actor.display_name}'s profile`} onPress={() => router.push({ pathname: '/user/[id]', params: { id: actor.id } })}>
          <Avatar name={actor.display_name} uri={actor.avatar_url} size={40} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {isMine ? 'You' : actor.display_name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={toIconName(meta.icon)} size={14} color={colors.textMuted} />
            <Text variant="small" tone="muted" numberOfLines={1}>
              {meta.label} · {relativeTime(activity.started_at)}
              {activity.source === 'manual' ? ' · Logged manually' : ''}
            </Text>
          </View>
        </View>
        {isMine ? <Icon name={toIconName(VISIBILITY_META[activity.visibility as Visibility].icon)} size={16} color={colors.textSubtle} accessibilityLabel={`Visible to ${VISIBILITY_META[activity.visibility as Visibility].label}`} /> : null}
      </View>

      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${activity.title}`} onPress={open} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Text variant="heading" style={{ marginTop: spacing.md }} numberOfLines={2}>
          {activity.title}
        </Text>

        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
          {activity.distance_m > 0 ? <Metric label="Distance" value={units.distance(activity.distance_m)} /> : null}
          <Metric label="Time" value={formatDurationShort(activity.moving_time_s)} />
          {speed ? <Metric label={speed.label} value={speed.value} /> : null}
        </View>

        {preview.length > 1 ? <RoutePreview points={preview} height={130} style={{ marginTop: spacing.md }} showEndpoints={false} /> : null}

        {!activity.is_eligible ? (
          <View style={{ marginTop: spacing.sm }}>
            <Chip label="Not counted toward challenges" icon="alert-circle-outline" size="sm" tone="secondary" />
          </View>
        ) : null}
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reacted ? 'Remove kudos' : 'Give kudos'}
          aria-selected={reacted}
          disabled={isMine}
          hitSlop={8}
          onPress={() => {
            haptics.light();
            toggle.mutate(activity.id);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: isMine ? 0.6 : 1 }}
        >
          <Icon name={reacted ? 'hand-clap' : 'hand-clap'} size={20} color={reacted ? colors.secondaryText : colors.textMuted} />
          <Text variant="smallStrong" tone={reacted ? 'secondary' : 'muted'}>
            {reactionCount > 0 ? reactionCount : 'Kudos'}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comments" onPress={open} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="comment-outline" size={19} color={colors.textMuted} />
          <Text variant="smallStrong" tone="muted">
            {activity.comment_count > 0 ? activity.comment_count : 'Comment'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="subheading" tabular>
        {value}
      </Text>
    </View>
  );
}

export function ActivityRow({
  id,
  type,
  title,
  startedAt,
  distanceM,
  movingTimeS,
  isEligible,
}: {
  id: string;
  type: ActivityType;
  title: string;
  startedAt: string;
  distanceM: number;
  movingTimeS: number;
  isEligible: boolean;
}) {
  const { colors, spacing, radii } = useAppTheme();
  const units = useUnits();
  const meta = ACTIVITY_TYPE_META[type];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta.label}, ${distanceM > 0 ? units.distance(distanceM) : ''} ${formatDurationShort(movingTimeS)}`}
      onPress={() => {
        haptics.tap();
        router.push({ pathname: '/activity/[id]', params: { id } });
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={toIconName(meta.icon)} size={22} color={colors.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="small" tone="muted">
          {new Date(startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          {isEligible ? '' : ' · not counted'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {distanceM > 0 ? (
          <Text variant="bodyStrong" tabular>
            {units.distance(distanceM)}
          </Text>
        ) : null}
        <Text variant="small" tone="muted" tabular>
          {formatDurationShort(movingTimeS)}
        </Text>
      </View>
    </Pressable>
  );
}
