import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, EmptyState, Icon, LoadingState, Screen, ScreenHeader, Text, toast } from '@/components/ui';
import { useInviteToChallenge } from '@/features/challenges/api';
import { useInviteToExpedition } from '@/features/journeys/api';
import { useFriends } from '@/features/social/api';
import { UserRow } from '@/features/social/components';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function InviteScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: 'challenge' | 'expedition'; id: string }>();
  const { spacing, colors } = useAppTheme();
  const friends = useFriends();
  const inviteChallenge = useInviteToChallenge(id);
  const inviteExpedition = useInviteToExpedition(id);
  const [selected, setSelected] = useState<string[]>([]);
  const list = (friends.data ?? []).filter((f) => f.status === 'friends');
  const pending = inviteChallenge.isPending || inviteExpedition.isPending;

  const send = () => {
    const mutation = kind === 'expedition' ? inviteExpedition : inviteChallenge;
    mutation.mutate(selected, {
      onSuccess: (count) => {
        toast.success(count ? `Sent ${count} ${count === 1 ? 'invitation' : 'invitations'}` : 'Everyone selected is already in or invited');
        router.back();
      },
      onError: (e) => toast.error(toUserMessage(e)),
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Invite friends" subtitle={kind === 'expedition' ? 'Travel the journey together.' : 'Challenge your friends.'} />
      {friends.isPending ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState icon="account-group-outline" title="No friends yet" message="Add friends first, then invite them here." actionLabel="Find friends" onAction={() => router.push('/friends')} />
      ) : (
        <View style={{ gap: spacing.xs }}>
          {list.map((f) => {
            const isSelected = selected.includes(f.user_id);
            return (
              <UserRow
                key={f.user_id}
                id={f.user_id}
                displayName={f.display_name}
                username={f.username}
                avatarUrl={f.avatar_url}
                level={f.level}
                right={
                  <Pressable
                    accessibilityRole="checkbox"
                    aria-checked={isSelected}
                    accessibilityLabel={`Invite ${f.display_name}`}
                    onPress={() => setSelected((cur) => (cur.includes(f.user_id) ? cur.filter((x) => x !== f.user_id) : [...cur, f.user_id]))}
                    hitSlop={10}
                  >
                    <Icon name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={28} color={isSelected ? colors.accentText : colors.textSubtle} />
                  </Pressable>
                }
              />
            );
          })}
          <Button label={selected.length ? `Send ${selected.length} ${selected.length === 1 ? 'invitation' : 'invitations'}` : 'Select friends'} icon="send" size="lg" disabled={!selected.length} loading={pending} onPress={send} style={{ marginTop: spacing.lg }} fullWidth />
          <Text variant="caption" tone="subtle" align="center">
            Invitations expire after 14 days.
          </Text>
        </View>
      )}
    </Screen>
  );
}
