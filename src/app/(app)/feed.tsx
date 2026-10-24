import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui';
import { useFeed } from '@/features/activities/api';
import { FeedItemView } from '@/features/activities/components/FeedItemView';
import { useUserId } from '@/features/auth/AuthProvider';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function FeedScreen() {
  const { spacing } = useAppTheme();
  const userId = useUserId();
  const feed = useFeed();
  const items = feed.data?.pages.flat() ?? [];
  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}
        ListHeaderComponent={<ScreenHeader title="Feed" subtitle="You and your friends." />}
        renderItem={({ item }) => <FeedItemView item={item} viewerId={userId} />}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshing={feed.isRefetching}
        onRefresh={() => void feed.refetch()}
        ListEmptyComponent={
          feed.isPending ? (
            <LoadingState />
          ) : feed.isError ? (
            <ErrorState message="Could not load the feed." onRetry={() => void feed.refetch()} />
          ) : (
            <EmptyState icon="account-group-outline" title="Nothing yet" message="Add friends to fill your feed." actionLabel="Find friends" onAction={() => router.push('/friends')} />
          )
        }
        ListFooterComponent={feed.isFetchingNextPage ? <View style={{ paddingVertical: spacing.lg }}><LoadingState /></View> : undefined}
      />
    </Screen>
  );
}
