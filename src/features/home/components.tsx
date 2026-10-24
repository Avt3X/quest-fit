import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Button, Card, Icon, InlineNotice, Text, toast } from '@/components/ui';
import { useRecording } from '@/features/recording/recording-store';
import { flushUploads, useUploadQueue } from '@/features/recording/upload-queue';
import { type PendingInvitation, useInvitations, useRespondInvitation } from '@/features/notifications/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export function RecordingBanner() {
  const session = useRecording((s) => s.session);
  if (!session) return null;
  return (
    <InlineNotice
      tone={session.interruptedAt ? 'warning' : 'info'}
      icon="record-rec"
      title={session.interruptedAt ? 'Your recording was interrupted' : session.status === 'finished' ? 'Finish saving your activity' : 'Recording in progress'}
      message={session.interruptedAt ? 'QuestFit was closed while recording. We paused it at the last known point. Resume or save it.' : undefined}
      action={<Button label="Open recorder" size="sm" icon="arrow-right" onPress={() => router.push('/record/live')} />}
    />
  );
}

export function UploadsBanner() {
  const items = useUploadQueue((s) => s.items);
  const flushing = useUploadQueue((s) => s.flushing);
  if (!items.length) return null;
  const failed = items.filter((i) => i.status === 'failed').length;
  return (
    <InlineNotice
      tone={failed ? 'danger' : 'warning'}
      icon={failed ? 'cloud-alert' : 'cloud-upload-outline'}
      title={failed ? `${failed} activity could not be saved` : `${items.length} ${items.length === 1 ? 'activity is' : 'activities are'} waiting to upload`}
      message={failed ? 'Review the problem and decide what to do with it.' : 'Saved safely on this device. We will upload automatically when you are online.'}
      action={
        <>
          <Button label={flushing ? 'Uploading…' : 'Retry now'} size="sm" variant="outline" loading={flushing} onPress={() => void flushUploads()} />
          <Button label="Details" size="sm" variant="ghost" onPress={() => router.push('/uploads')} />
        </>
      }
    />
  );
}

function InvitationRow({ invitation }: { invitation: PendingInvitation }) {
  const { spacing } = useAppTheme();
  const respond = useRespondInvitation();
  const title = invitation.kind === 'challenge' ? invitation.challenge?.title ?? 'a challenge' : invitation.expedition?.name ?? 'an expedition';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Avatar name={invitation.inviter?.display_name ?? '?'} uri={invitation.inviter?.avatar_url} size={40} />
      <View style={{ flex: 1 }}>
        <Text variant="smallStrong" numberOfLines={2}>
          {invitation.inviter?.display_name ?? 'A friend'} invited you to {title}
        </Text>
        <Text variant="caption" tone="muted">
          Expires {new Date(invitation.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <Button
        label="Join"
        size="sm"
        loading={respond.isPending}
        onPress={() =>
          respond.mutate(
            { id: invitation.id, accept: true },
            {
              onSuccess: (r) => {
                toast.success('You are in!');
                if (r.challenge_id) router.push({ pathname: '/challenge/[id]', params: { id: r.challenge_id } });
                if (r.expedition_id) router.push({ pathname: '/expedition/[id]', params: { id: r.expedition_id } });
              },
              onError: (e) => toast.error(toUserMessage(e)),
            },
          )
        }
      />
      <Button label="No" size="sm" variant="ghost" onPress={() => respond.mutate({ id: invitation.id, accept: false })} />
    </View>
  );
}

export function InvitationsCard() {
  const { spacing } = useAppTheme();
  const invitations = useInvitations();
  if (!invitations.data?.length) return null;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name="email-open-outline" size={20} />
        <Text variant="heading">Invitations</Text>
      </View>
      {invitations.data.map((inv) => (
        <InvitationRow key={inv.id} invitation={inv} />
      ))}
    </Card>
  );
}

export function FirstQuestCard({ hasActivity, hasChallenge, hasJourney }: { hasActivity: boolean; hasChallenge: boolean; hasJourney: boolean }) {
  const { colors, spacing } = useAppTheme();
  const steps = [
    { done: hasActivity, label: 'Record or log your first activity', action: () => router.push('/record') },
    { done: hasChallenge, label: 'Join a challenge', action: () => router.push('/explore') },
    { done: hasJourney, label: 'Set out on an epic journey', action: () => router.push('/journeys') },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card tone="accent" style={{ gap: spacing.md }}>
      <Text variant="heading">Your first quest</Text>
      {steps.map((s) => (
        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name={s.done ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} color={s.done ? colors.accentText : colors.textMuted} />
          <Text variant="body" style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }} tone={s.done ? 'muted' : 'default'}>
            {s.label}
          </Text>
          {!s.done ? <Button label="Go" size="sm" variant="outline" onPress={s.action} /> : null}
        </View>
      ))}
    </Card>
  );
}
