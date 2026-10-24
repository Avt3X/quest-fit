import { Button, EmptyState, LoadingState, Screen, ScreenHeader, toast } from '@/components/ui';
import { useBlockedUsers, useUnblockUser } from '@/features/social/api';
import { UserRow } from '@/features/social/components';
import { toUserMessage } from '@/lib/errors';

export default function BlockedUsersScreen() {
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();
  return (
    <Screen>
      <ScreenHeader title="Blocked people" subtitle="Blocked people cannot see your profile or activities, and you will not see theirs." />
      {blocked.isPending ? (
        <LoadingState />
      ) : blocked.data?.length ? (
        blocked.data.map((b) => (
          <UserRow
            key={b.user_id}
            id={b.user_id}
            displayName={b.display_name}
            username={b.username}
            avatarUrl={b.avatar_url}
            right={<Button label="Unblock" size="sm" variant="outline" onPress={() => unblock.mutate(b.user_id, { onSuccess: () => toast.info('Unblocked'), onError: (e) => toast.error(toUserMessage(e)) })} />}
          />
        ))
      ) : (
        <EmptyState icon="account-cancel-outline" title="Nobody blocked" message="You can block someone from their profile." />
      )}
    </Screen>
  );
}
