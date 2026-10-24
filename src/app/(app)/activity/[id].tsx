import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  IconButton,
  InlineNotice,
  LoadingState,
  Screen,
  ScreenHeader,
  Section,
  Text,
  TextField,
  confirm,
  toIconName,
  toast,
} from '@/components/ui';
import { ACTIVITY_TYPE_META, VISIBILITY_META } from '@/domain/activity-types';
import { parseRoutePreview } from '@/domain/geo';
import { formatDuration } from '@/domain/units';
import {
  useActivity,
  useActivityRoute,
  useAddComment,
  useComments,
  useDeleteActivity,
  useDeleteComment,
  useRemoveRoute,
  useToggleReaction,
} from '@/features/activities/api';
import { RouteMap } from '@/features/activities/components/RouteMap';
import { RoutePreview } from '@/features/activities/components/RoutePreview';
import { StatGrid } from '@/features/activities/components/StatGrid';
import { useUserId } from '@/features/auth/AuthProvider';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const userId = useUserId();
  const detail = useActivity(id, userId);
  const isOwner = detail.data?.activity.user_id === userId;
  const route = useActivityRoute(id, isOwner);
  const comments = useComments(id);
  const addComment = useAddComment(id);
  const deleteComment = useDeleteComment(id);
  const toggle = useToggleReaction();
  const deleteActivity = useDeleteActivity();
  const removeRoute = useRemoveRoute(id);
  const [comment, setComment] = useState('');

  if (detail.isPending) return <LoadingState />;
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <ScreenHeader title="Activity" />
        <ErrorState message={toUserMessage(detail.error, 'This activity is not available. It may be private or deleted.')} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  const { activity: a, owner, reactionCount, reacted } = detail.data;
  const meta = ACTIVITY_TYPE_META[a.type];
  const speed = units.speedFor(a.type, a.avg_speed_mps ?? 0);
  const fullRoute = (route.data ?? []).map((p) => ({ lat: p.lat, lng: p.lng, segment: p.segment }));
  const preview = parseRoutePreview(a.route_preview);
  const vis = VISIBILITY_META[a.visibility];

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this activity?',
      message: 'It will be removed from your history, stats and any challenge or journey that has not finished yet. Earned achievements are kept.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleteActivity.mutate(a.id, {
      onSuccess: () => {
        toast.success('Activity deleted');
        router.back();
      },
      onError: (e) => toast.error(toUserMessage(e)),
    });
  };

  const onRemoveRoute = async () => {
    const ok = await confirm({
      title: 'Remove the GPS route?',
      message: 'The map and every GPS point are permanently deleted. Distance and time stay on the activity.',
      confirmLabel: 'Remove route',
      destructive: true,
    });
    if (ok) removeRoute.mutate(undefined, { onSuccess: () => toast.success('Route removed'), onError: (e) => toast.error(toUserMessage(e)) });
  };

  const submitComment = () => {
    const body = comment.trim();
    if (!body) return;
    addComment.mutate(body, { onSuccess: () => setComment(''), onError: (e) => toast.error(toUserMessage(e)) });
  };

  return (
    <Screen keyboard>
      <ScreenHeader
        title={a.title}
        subtitle={`${meta.label} · ${new Date(a.started_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        right={
          <IconButton
            icon="share-variant"
            accessibilityLabel="Share"
            onPress={() => void Share.share({ message: `${a.title} · ${meta.label}${a.distance_m ? ` · ${units.distance(a.distance_m)}` : ''} · ${formatDuration(a.moving_time_s)} on QuestFit` })}
          />
        }
      />

      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/user/[id]', params: { id: owner.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={owner.display_name} uri={owner.avatar_url} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{isOwner ? 'You' : owner.display_name}</Text>
          <Text variant="small" tone="muted">
            @{owner.username}
          </Text>
        </View>
        <Chip label={vis.label} icon={toIconName(vis.icon)} size="sm" />
      </Pressable>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
        <Chip label={a.source === 'gps' ? 'GPS recorded' : 'Logged manually'} icon={a.source === 'gps' ? 'crosshairs-gps' : 'pencil-outline'} size="sm" tone={a.source === 'gps' ? 'accent' : 'default'} />
      </View>

      {!a.is_eligible ? (
        <View style={{ marginTop: spacing.md }}>
          <InlineNotice tone="warning" title="Not counted toward progress" message={a.ineligible_reason ?? undefined} />
        </View>
      ) : null}

      {isOwner && fullRoute.length > 1 ? (
        <RouteMap points={fullRoute} height={260} style={{ marginTop: spacing.lg }} />
      ) : preview.length > 1 ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
          <RoutePreview points={preview} height={200} showEndpoints={false} />
          <Text variant="caption" tone="subtle">
            Start and finish areas may be hidden for privacy.
          </Text>
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <StatGrid
          stats={[
            ...(a.distance_m > 0 ? [{ label: 'Distance', value: units.distance(a.distance_m) }] : []),
            { label: 'Moving time', value: formatDuration(a.moving_time_s) },
            ...(speed ? [{ label: speed.label, value: speed.value }] : []),
            { label: 'Elapsed', value: formatDuration(a.elapsed_time_s) },
            ...(a.elevation_gain_m ? [{ label: 'Elevation', value: units.elevation(a.elevation_gain_m) }] : []),
          ]}
        />
      </Card>

      {a.description ? (
        <Text variant="body" style={{ marginTop: spacing.lg }}>
          {a.description}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, alignItems: 'center' }}>
        <Button
          label={reactionCount > 0 ? `Kudos · ${reactionCount}` : 'Kudos'}
          icon="hand-clap"
          variant={reacted ? 'primary' : 'outline'}
          size="sm"
          disabled={isOwner}
          loading={toggle.isPending}
          onPress={() => toggle.mutate(a.id, { onError: (e) => toast.error(toUserMessage(e)) })}
        />
      </View>

      <Section title="Comments">
        {comments.data?.length ? (
          comments.data.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: spacing.md }}>
              <Avatar name={c.author?.display_name ?? '?'} uri={c.author?.avatar_url} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="smallStrong">
                  {c.user_id === userId ? 'You' : c.author?.display_name ?? 'Someone'} <Text variant="caption" tone="subtle">· {relativeTime(c.created_at)}</Text>
                </Text>
                <Text variant="body">{c.body}</Text>
              </View>
              {c.user_id === userId || isOwner ? (
                <IconButton icon="close" size={16} accessibilityLabel="Delete comment" onPress={() => deleteComment.mutate(c.id)} />
              ) : null}
            </View>
          ))
        ) : (
          <Text variant="small" tone="muted">
            No comments yet.
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField label="Add a comment" value={comment} onChangeText={setComment} maxLength={500} onSubmitEditing={submitComment} returnKeyType="send" />
          </View>
          <IconButton icon="send" accessibilityLabel="Send comment" variant="accent" onPress={submitComment} style={{ marginBottom: 4 }} />
        </View>
      </Section>

      {isOwner ? (
        <Section title="Manage">
          <Card style={{ gap: spacing.xs }}>
            <Button label="Edit activity" icon="pencil" variant="ghost" onPress={() => router.push({ pathname: '/activity/edit/[id]', params: { id: a.id } })} style={{ justifyContent: 'flex-start' }} />
            {a.has_route ? <Button label="Remove GPS route" icon="map-marker-remove-outline" variant="ghost" onPress={() => void onRemoveRoute()} /> : null}
            <Button label="Delete activity" icon="delete-outline" variant="ghost" loading={deleteActivity.isPending} onPress={() => void onDelete()} />
          </Card>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Icon name="information-outline" size={16} color={colors.textSubtle} />
            <Text variant="caption" tone="subtle" style={{ flex: 1 }}>
              Edits update challenges and journeys that are still running. Finished challenge results do not change.
            </Text>
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
