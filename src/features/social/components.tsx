import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar, Button, Text, toast } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import { type Relationship, useRespondFriendRequest, useSendFriendRequest } from './api';

export function FriendAction({ userId, relationship }: { userId: string; relationship: Relationship }) {
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const onError = (e: unknown) => toast.error(toUserMessage(e));
  if (relationship === 'friends') return <Button label="Friends" size="sm" variant="secondary" icon="check" disabled haptic="none" />;
  if (relationship === 'outgoing') return <Button label="Requested" size="sm" variant="outline" disabled haptic="none" />;
  if (relationship === 'incoming') {
    return (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button label="Accept" size="sm" loading={respond.isPending} onPress={() => respond.mutate({ userId, accept: true }, { onError, onSuccess: () => toast.success('Friend added') })} />
        <Button label="Decline" size="sm" variant="ghost" onPress={() => respond.mutate({ userId, accept: false }, { onError })} />
      </View>
    );
  }
  return <Button label="Add" size="sm" icon="account-plus" loading={send.isPending} onPress={() => send.mutate(userId, { onError, onSuccess: () => toast.success('Friend request sent') })} />;
}

export function UserRow({
  id,
  displayName,
  username,
  avatarUrl,
  level,
  right,
  subtitle,
}: {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  level?: number;
  right?: React.ReactNode;
  subtitle?: string;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${displayName}'s profile`}
        onPress={() => {
          haptics.tap();
          router.push({ pathname: '/user/[id]', params: { id } });
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
      >
        <Avatar name={displayName} uri={avatarUrl} size={44} level={level} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {displayName}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle ?? `@${username}`}
          </Text>
        </View>
      </Pressable>
      {right}
    </View>
  );
}
