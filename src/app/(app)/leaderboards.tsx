import { useState } from 'react';
import { View } from 'react-native';

import { Card, ErrorState, LoadingState, Screen, ScreenHeader, SegmentedControl, Text } from '@/components/ui';
import { LeaderboardList } from '@/features/challenges/components';
import { useLeaderboard } from '@/features/social/api';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function LeaderboardsScreen() {
  const { spacing } = useAppTheme();
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [scope, setScope] = useState<'friends' | 'global'>('friends');
  const [metric, setMetric] = useState<'distance' | 'duration' | 'count'>('distance');
  const board = useLeaderboard(period, scope, metric);
  const entries = (board.data ?? []).map((e) => ({ ...e, team_id: null, completed_at: null }));

  return (
    <Screen refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <ScreenHeader title="Leaderboards" subtitle="How you stack up against friends and the community." />
      <View style={{ gap: spacing.sm }}>
        <SegmentedControl options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]} value={period} onChange={setPeriod} accessibilityLabel="Period" />
        <SegmentedControl options={[{ value: 'friends', label: 'Friends', icon: 'account-multiple' }, { value: 'global', label: 'Everyone', icon: 'earth' }]} value={scope} onChange={setScope} accessibilityLabel="Scope" />
        <SegmentedControl options={[{ value: 'distance', label: 'Distance' }, { value: 'duration', label: 'Time' }, { value: 'count', label: 'Activities' }]} value={metric} onChange={setMetric} accessibilityLabel="Metric" />
      </View>
      <Card style={{ marginTop: spacing.lg }}>
        {board.isPending ? (
          <LoadingState />
        ) : board.isError ? (
          <ErrorState compact message="Could not load the leaderboard." onRetry={() => void board.refetch()} />
        ) : (
          <LeaderboardList entries={entries} metric={metric} emptyLabel={scope === 'friends' ? 'No activity from you or your friends in this period yet.' : 'No public activity in this period yet.'} />
        )}
      </Card>
      <Text variant="caption" tone="subtle" style={{ marginTop: spacing.sm }}>
        Weeks start on Monday in your time zone. Private activities and private profiles never appear on leaderboards. Your own row is always shown.
      </Text>
    </Screen>
  );
}
