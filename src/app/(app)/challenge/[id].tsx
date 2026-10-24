import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  type IconName,
  InlineNotice,
  LoadingState,
  ProgressRing,
  Screen,
  ScreenHeader,
  Section,
  SegmentedControl,
  Text,
  confirm,
  toast,
} from '@/components/ui';
import { ACTIVITY_TYPE_META } from '@/domain/activity-types';
import { formatDeadline, formatWindow } from '@/domain/periods';
import { progressFraction, projectProgress, remainingValue } from '@/domain/progress';
import { ordinal } from '@/domain/ranking';
import { challengeStatus, useChallenge, useChallengeLeaderboard, useJoinChallenge, useLeaveChallenge } from '@/features/challenges/api';
import { ChallengeCover, LeaderboardList, MODE_META, TeamStandings, TypeIcons, statusLabel } from '@/features/challenges/components';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

function Rule({ icon, text }: { icon: IconName; text: string }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Icon name={icon} size={18} color={colors.accentText} style={{ marginTop: 2 }} />
      <Text variant="small" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing, colors, radii } = useAppTheme();
  const units = useUnits();
  const detail = useChallenge(id);
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const board = useChallengeLeaderboard(id, scope);
  const join = useJoinChallenge();
  const leave = useLeaveChallenge();
  const [teamChoice, setTeamChoice] = useState<string | null>(null);

  if (detail.isPending) return <LoadingState />;
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <ScreenHeader title="Challenge" />
        <ErrorState message={toUserMessage(detail.error, 'This challenge is not available. It may be private.')} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  const { challenge: c, me, creator } = detail.data;
  const now = new Date();
  const status = challengeStatus(c, now);
  const joined = !!me;
  const target = c.target_value ? Number(c.target_value) : null;
  const shared = c.mode === 'collaborative';
  const myTeam = c.challenge_teams.find((t) => t.id === me?.team_id) ?? null;
  const progressValue = shared ? Number(c.total_progress) : c.mode === 'team' && myTeam ? Number(myTeam.total_progress) : Number(me?.progress_value ?? 0);
  const fraction = progressFraction(progressValue, target);
  const projection = target && joined && status === 'active' ? projectProgress({ value: progressValue, target, startsAt: new Date(c.starts_at), endsAt: new Date(c.ends_at), now }) : null;
  const myRank = board.data?.find((e) => e.is_me)?.rank;
  const canJoin = !joined && (status === 'active' || status === 'upcoming') && (!c.join_deadline || new Date(c.join_deadline) > now) && (!c.max_participants || c.participant_count < c.max_participants);
  const typeLabels = c.activity_types.map((t) => ACTIVITY_TYPE_META[t].label).join(', ');

  const onJoin = () =>
    join.mutate(
      { challengeId: c.id, teamId: c.mode === 'team' ? teamChoice : null },
      { onSuccess: () => toast.success(c.retroactive && status === 'active' ? 'Joined! Earlier eligible activities were counted.' : 'Joined! Good luck.'), onError: (e) => toast.error(toUserMessage(e)) },
    );

  const onLeave = async () => {
    const ok = await confirm({
      title: 'Leave this challenge?',
      message: shared || c.mode === 'team' ? 'Your contributions will be removed from the shared total. A goal that was already reached stays reached.' : 'Your progress in this challenge will be removed. You can rejoin while it is running.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) leave.mutate(c.id, { onSuccess: () => toast.info('You left the challenge.'), onError: (e) => toast.error(toUserMessage(e)) });
  };

  const share = () =>
    void Share.share({
      message: c.visibility === 'private' && c.invite_code
        ? `Join my QuestFit challenge "${c.title}" with code ${c.invite_code} (questfit://join/${c.invite_code})`
        : `Join the "${c.title}" challenge on QuestFit!`,
    });

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => { void detail.refetch(); void board.refetch(); }}>
      <ScreenHeader title={c.title} subtitle={c.is_official ? 'Official QuestFit challenge' : creator ? `Created by ${creator.display_name}` : undefined} />
      <View style={{ borderRadius: radii.xl, overflow: 'hidden' }}>
        <ChallengeCover cover={c.cover_art} mode={c.mode} height={120} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Chip label={MODE_META[c.mode].label} icon={MODE_META[c.mode].icon} tone="accent" size="sm" />
        <Chip label={statusLabel(c, now)} icon="clock-outline" size="sm" />
        <Chip label={`${c.participant_count.toLocaleString('en-US')} joined`} icon="account-multiple" size="sm" />
        {c.visibility === 'private' ? <Chip label="Private" icon="lock" size="sm" /> : null}
        {c.recurrence !== 'none' ? <Chip label={`Repeats ${c.recurrence}`} icon="repeat" size="sm" /> : null}
      </View>

      {c.description ? (
        <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
          {c.description}
        </Text>
      ) : null}

      {joined || shared ? (
        <Card style={{ marginTop: spacing.lg, alignItems: 'center', gap: spacing.md }}>
          {target ? (
            <ProgressRing value={fraction} size={150} accessibilityLabel={`${Math.round(fraction * 100)} percent of the goal`}>
              <Text variant="title" tabular>
                {Math.round(fraction * 100)}%
              </Text>
              <Text variant="caption" tone="muted">
                {shared ? 'together' : c.mode === 'team' ? 'team' : 'complete'}
              </Text>
            </ProgressRing>
          ) : null}
          <Text variant="heading" align="center" tabular>
            {units.metric(c.metric, progressValue)}
            {target ? <Text tone="muted"> / {units.metric(c.metric, target)}</Text> : null}
          </Text>
          {(shared || c.mode === 'team') && joined ? (
            <Text variant="small" tone="muted">
              Your contribution: {units.metric(c.metric, Number(me?.progress_value ?? 0))}
              {myTeam ? ` · ${myTeam.name}` : ''}
            </Text>
          ) : null}
          {me?.completed_at ? <Chip label="Completed" icon="check-decagram" tone="accent" /> : null}
          {myRank && c.mode !== 'collaborative' ? (
            <Text variant="small" tone="muted">
              You are {ordinal(myRank)} of {c.participant_count}
            </Text>
          ) : null}
          {target && !me?.completed_at && projection ? (
            <Text variant="small" tone={projection.onTrack ? 'success' : 'warning'} align="center">
              {projection.onTrack
                ? 'On track to finish before the deadline.'
                : `${units.metric(c.metric, remainingValue(progressValue, target))} to go · about ${units.metric(c.metric, Math.ceil(projection.requiredPerDay))} per day.`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {c.mode === 'team' ? (
        <Section title="Team standings">
          <TeamStandings teams={c.challenge_teams} metric={c.metric} target={target} myTeamId={me?.team_id ?? null} />
          {canJoin ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="smallStrong" tone="muted">
                Pick a team (or let us balance the teams)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {c.challenge_teams.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="radio"
                    aria-checked={teamChoice === t.id}
                    onPress={() => setTeamChoice((cur) => (cur === t.id ? null : t.id))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: teamChoice === t.id ? t.color : colors.border }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color }} />
                    <Text variant="smallStrong">{t.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Section>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
        {canJoin ? <Button label={status === 'upcoming' ? 'Join before it starts' : 'Join challenge'} icon="flag-plus" size="lg" loading={join.isPending} onPress={onJoin} fullWidth testID="join-challenge" /> : null}
        {!joined && !canJoin && status !== 'ended' && status !== 'grace' ? <InlineNotice tone="info" title="Joining is closed" message="The joining deadline has passed or the challenge is full." /> : null}
        {joined && status !== 'ended' && status !== 'grace' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Invite friends" icon="account-plus" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/invite', params: { kind: 'challenge', id: c.id } })} />
            <Button label="Share" icon="share-variant" variant="outline" style={{ flex: 1 }} onPress={share} />
          </View>
        ) : null}
        {c.visibility === 'private' && c.invite_code && joined ? (
          <Card tone="muted" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Icon name="ticket-confirmation-outline" size={22} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="muted">
                Invite code
              </Text>
              <Text variant="heading" style={{ letterSpacing: 3 }}>
                {c.invite_code}
              </Text>
            </View>
          </Card>
        ) : null}
      </View>

      <Section title="Leaderboard" action={<View style={{ width: 170 }}><SegmentedControl options={[{ value: 'all', label: 'Everyone' }, { value: 'friends', label: 'Friends' }]} value={scope} onChange={setScope} /></View>}>
        <Card>
          {board.isPending ? <LoadingState /> : board.isError ? <ErrorState compact message="Could not load the leaderboard." onRetry={() => void board.refetch()} /> : <LeaderboardList entries={board.data ?? []} metric={c.metric} teams={c.challenge_teams} />}
        </Card>
        <Text variant="caption" tone="subtle">
          Equal totals share a rank; whoever reached it first is listed first. Only totals are shown, never activity details.
        </Text>
      </Section>

      <Section title="Rules">
        <Card style={{ gap: spacing.md }}>
          <Rule icon="information-outline" text={MODE_META[c.mode].description} />
          <Rule icon="calendar-range" text={`${formatWindow(new Date(c.starts_at), new Date(c.ends_at), c.timezone)} (${c.timezone}). Ends ${formatDeadline(new Date(c.ends_at), c.timezone)}.`} />
          <Rule icon="run" text={`Counts: ${typeLabels}. Measured by ${c.metric === 'distance' ? 'distance' : c.metric === 'duration' ? 'moving time' : 'number of activities'}.`} />
          <Rule icon="timer-sand" text="An activity counts if it starts inside the challenge window, even if it finishes after the deadline." />
          <Rule icon="cloud-upload-outline" text={`Late uploads are accepted for ${c.submission_grace_hours} hours after the end (for recordings saved offline).`} />
          <Rule icon={c.allow_manual ? 'pencil-outline' : 'crosshairs-gps'} text={c.allow_manual ? 'Manually logged activities count.' : 'Only GPS-recorded activities count.'} />
          <Rule icon="account-clock-outline" text={c.retroactive ? 'Joining late? Eligible activities since the start are counted automatically.' : 'Only activities that start after you join are counted.'} />
          <Rule icon="logout" text="You can leave any time before the end; your contributions are withdrawn." />
          <TypeIcons types={c.activity_types} />
        </Card>
      </Section>

      {joined && status !== 'ended' && status !== 'grace' ? (
        <Button label="Leave challenge" icon="logout" variant="ghost" loading={leave.isPending} onPress={() => void onLeave()} style={{ marginTop: spacing.xl }} />
      ) : null}
    </Screen>
  );
}
