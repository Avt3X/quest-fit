import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Avatar, Button, Card, Chip, ErrorState, Icon, LoadingState, ProgressBar, Screen, ScreenHeader, Section, Text, confirm, toast } from '@/components/ui';
import { estimateDaysToFinish, journeyPosition } from '@/domain/progress';
import { useActivityStats } from '@/features/activities/api';
import { useUserId } from '@/features/auth/AuthProvider';
import { useExpedition, useLeaveExpedition } from '@/features/journeys/api';
import { JourneyMap } from '@/features/journeys/JourneyMap';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ExpeditionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const userId = useUserId();
  const detail = useExpedition(id);
  const leave = useLeaveExpedition();
  const [today] = useState(() => new Date());
  const [twoWeeksAgo] = useState(() => new Date(today.getTime() - 13 * 86_400_000));
  const journeyTypes = detail.data?.journey.activity_types;
  const recent = useActivityStats({ from: twoWeeksAgo, to: today, bucket: 'day', types: journeyTypes });

  if (detail.isPending) return <LoadingState />;
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <ScreenHeader title="Expedition" />
        <ErrorState message={toUserMessage(detail.error, 'This expedition is not available.')} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  const { expedition: e, journey: j, members, unlocks } = detail.data;
  const total = Number(j.total_distance_m);
  const pos = journeyPosition(Number(e.progress_m), total, j.checkpoints);
  const unlockedIds = new Set(unlocks.map((u) => u.checkpoint_id));
  const me = members.find((m) => m.user_id === userId);
  const isGroup = e.mode === 'group';
  const activeMembers = members.filter((m) => m.is_active || e.status === 'completed');
  const recentDistance = (recent.data ?? []).reduce((s, b) => s + Number(b.distance_m), 0);
  // For groups the party's recent pace is approximated by the personal pace times active members.
  const eta = e.status === 'active' ? estimateDaysToFinish(pos.remainingM, recentDistance * (isGroup ? Math.max(1, activeMembers.length) : 1), 14) : null;

  const onLeave = async () => {
    const ok = await confirm({
      title: isGroup ? 'Leave this expedition?' : 'Abandon this journey?',
      message: isGroup ? 'The distance you contributed stays with the party. You can start or join another expedition afterwards.' : 'Your progress will be kept in history, but the journey ends here. You can start it again later.',
      confirmLabel: isGroup ? 'Leave' : 'Abandon',
      destructive: true,
    });
    if (ok)
      leave.mutate(e.id, {
        onSuccess: () => {
          toast.info('You left the expedition.');
          router.back();
        },
        onError: (err) => toast.error(toUserMessage(err)),
      });
  };

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
      <ScreenHeader title={isGroup ? e.name ?? j.title : j.title} subtitle={isGroup ? `${j.title} · group expedition` : 'Solo expedition'} />
      <JourneyMap id={e.id} artKey={j.art_key} path={j.map_path} totalM={total} progressM={Number(e.progress_m)} checkpoints={j.checkpoints} unlockedIds={unlockedIds} />

      <Card style={{ marginTop: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text variant="overline" tone="muted">
              {isGroup ? 'Party progress' : 'Your progress'}
            </Text>
            <Text variant="display" tabular>
              {Math.round(pos.fraction * 100)}%
            </Text>
          </View>
          {e.status === 'completed' ? <Chip label="Completed" icon="check-decagram" tone="accent" /> : e.status === 'abandoned' ? <Chip label="Abandoned" size="sm" /> : null}
        </View>
        <ProgressBar value={pos.fraction} height={12} secondaryValue={isGroup && me ? Number(me.contributed_m) / total : undefined} accessibilityLabel={`${Math.round(pos.fraction * 100)} percent complete`} />
        {isGroup && me ? (
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <Legend color={colors.accent} label="Party" />
            <Legend color={colors.secondary} label="Your share" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text variant="caption" tone="muted">
              Completed
            </Text>
            <Text variant="heading" tabular>
              {units.distance(pos.completedM)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" tone="muted">
              Remaining
            </Text>
            <Text variant="heading" tabular>
              {units.distance(pos.remainingM)}
            </Text>
          </View>
        </View>
        {pos.current ? (
          <Text variant="small" tone="muted">
            Last checkpoint: <Text variant="smallStrong">{pos.current.name}</Text>
          </Text>
        ) : null}
        {pos.next && e.status === 'active' ? (
          <Text variant="small" tone="accent">
            {units.distance(pos.distanceToNextM ?? 0)} to {pos.next.name}
          </Text>
        ) : null}
        {eta !== null && eta > 0 ? (
          <Text variant="caption" tone="subtle">
            At your recent pace you could finish in about {eta} {eta === 1 ? 'day' : 'days'}.
          </Text>
        ) : null}
      </Card>

      {isGroup ? (
        <Section title={`Party · ${activeMembers.length}`}>
          <Card style={{ gap: spacing.md }}>
            {members.map((m) => (
              <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: m.left_at ? 0.55 : 1 }}>
                <Avatar name={m.profile?.display_name ?? '?'} uri={m.profile?.avatar_url} size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{m.user_id === userId ? 'You' : m.profile?.display_name ?? 'Traveller'}</Text>
                  <Text variant="caption" tone="muted">
                    {m.left_at ? 'Left the party' : `Joined ${new Date(m.joined_at).toLocaleDateString()}`}
                  </Text>
                </View>
                <Text variant="bodyStrong" tabular>
                  {units.distance(Number(m.contributed_m))}
                </Text>
              </View>
            ))}
          </Card>
          {e.status === 'active' && me?.is_active ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Invite friends" icon="account-plus" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/invite', params: { kind: 'expedition', id: e.id } })} />
              <Button label={`Code ${e.invite_code ?? ''}`} icon="share-variant" variant="outline" style={{ flex: 1 }} onPress={() => void Share.share({ message: `Join my QuestFit expedition on ${j.title} with code ${e.invite_code} (questfit://join/${e.invite_code})` })} />
            </View>
          ) : null}
        </Section>
      ) : null}

      <Section title="Checkpoints">
        {j.checkpoints.map((c) => {
          const reached = unlockedIds.has(c.id);
          const when = unlocks.find((u) => u.checkpoint_id === c.id)?.reached_at;
          return (
            <Card key={c.id} tone={reached ? 'accent' : 'surface'} style={{ gap: spacing.xs, opacity: reached ? 1 : 0.8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name={reached ? 'check-circle' : 'lock-outline'} size={20} color={reached ? colors.accentText : colors.textSubtle} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {c.name}
                </Text>
                <Text variant="caption" tone="muted" tabular>
                  {units.distance(Number(c.distance_m), 0)}
                </Text>
              </View>
              <Text variant="small" tone="muted">
                {reached && c.story ? c.story : c.description}
              </Text>
              {when && c.position > 0 ? (
                <Text variant="caption" tone="subtle">
                  Reached {new Date(when).toLocaleDateString()}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </Section>

      {e.status === 'active' && me?.is_active ? (
        <Button label={isGroup ? 'Leave expedition' : 'Abandon journey'} icon="logout" variant="ghost" loading={leave.isPending} onPress={() => void onLeave()} style={{ marginTop: spacing.xl }} />
      ) : null}
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
