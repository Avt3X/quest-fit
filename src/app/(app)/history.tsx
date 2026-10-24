import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Card, Chip, ChipRow, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, SegmentedControl, Text, toIconName } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from '@/domain/activity-types';
import { formatDurationShort } from '@/domain/units';
import { type HistoryRange, useActivityStats, useMyActivities } from '@/features/activities/api';
import { ActivityRow } from '@/features/activities/components/ActivityCard';
import { BarChart } from '@/features/activities/components/BarChart';
import { StatTile } from '@/features/activities/components/StatGrid';
import { useUserId } from '@/features/auth/AuthProvider';
import { useUnits } from '@/hooks/useUnits';
import { useAppTheme } from '@/theme/ThemeProvider';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: 'Year' },
  { value: 'all', label: 'All' },
];

export default function HistoryScreen() {
  const { spacing } = useAppTheme();
  const units = useUnits();
  const userId = useUserId();
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [range, setRange] = useState<HistoryRange>('30d');
  const [bucket, setBucket] = useState<'week' | 'month'>('week');
  const list = useMyActivities(userId, { types, range });

  const to = useMemo(() => new Date(), []);
  const from = useMemo(() => new Date(to.getTime() - (bucket === 'week' ? 11 * 7 : 365) * 86_400_000), [to, bucket]);
  const stats = useActivityStats({ from, to, bucket, types });
  const rows = list.data?.pages.flat() ?? [];
  const totals = (stats.data ?? []).reduce((acc, b) => ({ d: acc.d + Number(b.distance_m), t: acc.t + Number(b.moving_time_s), n: acc.n + b.activity_count }), { d: 0, t: 0, n: 0 });
  const periods = stats.data?.length || 1;
  const bars = (stats.data ?? []).map((b, i, arr) => ({
    key: b.bucket_start,
    label: bucket === 'week' ? (i % 2 === 0 ? new Date(`${b.bucket_start}T12:00:00`).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : '') : new Date(`${b.bucket_start}T12:00:00`).toLocaleDateString(undefined, { month: 'narrow' }),
    value: Number(b.distance_m) || Number(b.moving_time_s) / 600,
    highlight: i === arr.length - 1,
    description: `${bucket === 'week' ? 'Week of' : ''} ${new Date(`${b.bucket_start}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: bucket === 'week' ? 'numeric' : undefined, year: 'numeric' })}: ${units.distance(Number(b.distance_m))}, ${b.activity_count} activities`,
  }));

  const header = (
    <View style={{ gap: spacing.lg }}>
      <ScreenHeader title="Stats & history" />
      <ChipRow>
        {ACTIVITY_TYPES.map((t) => (
          <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} size="sm" selected={types.includes(t)} onPress={() => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} />
        ))}
      </ChipRow>
      <Card style={{ gap: spacing.md }}>
        <SegmentedControl options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} value={bucket} onChange={setBucket} />
        {stats.isPending ? <LoadingState /> : <BarChart bars={bars} height={90} />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatTile label={bucket === 'week' ? 'Last 12 weeks' : 'Last 12 months'} value={units.compact(totals.d)} icon="map-marker-distance" tone="accent" />
          <StatTile label="Moving time" value={formatDurationShort(totals.t)} icon="timer-outline" />
          <StatTile label={`Activities per ${bucket}`} value={(totals.n / periods).toFixed(1)} icon="calendar-sync" />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {RANGES.map((r) => (
          <Chip key={r.value} label={r.label} selected={range === r.value} onPress={() => setRange(r.value)} size="sm" />
        ))}
      </View>
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge }}
        ListHeaderComponent={header}
        renderItem={({ item: a }) => <ActivityRow id={a.id} type={a.type} title={a.title} startedAt={a.started_at} distanceM={a.distance_m} movingTimeS={a.moving_time_s} isEligible={a.is_eligible} />}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          list.isPending ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message="Could not load your activities." onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState compact icon="run" title="Nothing here yet" message="No activities match these filters." />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <LoadingState /> : rows.length ? <Text variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>{list.hasNextPage ? '' : 'That’s everything.'}</Text> : undefined}
      />
    </Screen>
  );
}
