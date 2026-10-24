import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, EmptyState, LoadingState, Screen, ScreenHeader, Section, Text, TextField } from '@/components/ui';
import { useFriends, useProfileSearch } from '@/features/social/api';
import { FriendAction, UserRow } from '@/features/social/components';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function FriendsScreen() {
  const { spacing } = useAppTheme();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const search = useProfileSearch(query);
  const incoming = (friends.data ?? []).filter((f) => f.status === 'incoming');
  const outgoing = (friends.data ?? []).filter((f) => f.status === 'outgoing');
  const accepted = (friends.data ?? []).filter((f) => f.status === 'friends');

  return (
    <Screen refreshing={friends.isRefetching} onRefresh={() => void friends.refetch()}>
      <ScreenHeader title="Friends" right={<Button label="Blocked" variant="ghost" size="sm" onPress={() => router.push('/settings/blocked')} />} />
      <TextField label="Find people" value={query} onChangeText={setQuery} placeholder="Name or username" autoCapitalize="none" />
      {query.trim().length >= 2 ? (
        <Section title="Search results">
          {search.isPending ? (
            <LoadingState />
          ) : search.data?.length ? (
            search.data.map((p) => <UserRow key={p.id} id={p.id} displayName={p.display_name} username={p.username} avatarUrl={p.avatar_url} level={p.level} right={<FriendAction userId={p.id} relationship={p.friendship} />} />)
          ) : (
            <Text variant="small" tone="muted">
              No one found. Private profiles do not appear in search.
            </Text>
          )}
        </Section>
      ) : null}

      {incoming.length ? (
        <Section title={`Requests · ${incoming.length}`}>
          <Card style={{ gap: spacing.xs }}>
            {incoming.map((f) => (
              <UserRow key={f.user_id} id={f.user_id} displayName={f.display_name} username={f.username} avatarUrl={f.avatar_url} level={f.level} right={<FriendAction userId={f.user_id} relationship="incoming" />} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={`Friends · ${accepted.length}`}>
        {friends.isPending ? (
          <LoadingState />
        ) : accepted.length ? (
          <View>
            {accepted.map((f) => (
              <UserRow key={f.user_id} id={f.user_id} displayName={f.display_name} username={f.username} avatarUrl={f.avatar_url} level={f.level} subtitle={`@${f.username} · friends since ${new Date(f.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`} />
            ))}
          </View>
        ) : (
          <EmptyState compact icon="account-heart-outline" title="Adventures are better together" message="Search for friends by name or username, then challenge them or travel a journey together." />
        )}
      </Section>

      {outgoing.length ? (
        <Section title="Sent requests">
          {outgoing.map((f) => (
            <UserRow key={f.user_id} id={f.user_id} displayName={f.display_name} username={f.username} avatarUrl={f.avatar_url} right={<FriendAction userId={f.user_id} relationship="outgoing" />} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
