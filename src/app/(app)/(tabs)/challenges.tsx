import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, CardSkeleton, EmptyState, ErrorState, Screen, ScreenHeader, Section, SegmentedControl } from '@/components/ui';
import { challengeStatus, useMyChallenges } from '@/features/challenges/api';
import { ChallengeCard } from '@/features/challenges/components';
import { InvitationsCard } from '@/features/home/components';
import { useAppTheme } from '@/theme/ThemeProvider';

type Tab = 'active' | 'upcoming' | 'finished';

export default function ChallengesScreen() {
  const { spacing } = useAppTheme();
  const [tab, setTab] = useState<Tab>('active');
  const mine = useMyChallenges();
  const now = new Date();
  const entries = (mine.data ?? []).filter((e) => {
    const s = challengeStatus(e.challenge, now);
    if (tab === 'active') return s === 'active' || s === 'grace';
    if (tab === 'upcoming') return s === 'upcoming';
    return s === 'ended';
  });
  entries.sort((a, b) =>
    tab === 'finished'
      ? new Date(b.challenge.ends_at).getTime() - new Date(a.challenge.ends_at).getTime()
      : new Date(a.challenge.ends_at).getTime() - new Date(b.challenge.ends_at).getTime(),
  );

  return (
    <Screen refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()} testID="challenges-screen">
      <ScreenHeader
        title="Challenges"
        back={false}
        right={<Button label="Create" icon="plus" size="sm" onPress={() => router.push('/challenge/create')} />}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <Button label="Leaderboards" icon="podium" variant="outline" size="sm" onPress={() => router.push('/leaderboards')} style={{ flex: 1 }} />
        <Button label="Join with code" icon="ticket-confirmation-outline" variant="outline" size="sm" onPress={() => router.push('/join')} style={{ flex: 1 }} />
      </View>
      <InvitationsCard />
      <View style={{ marginTop: spacing.md }}>
        <SegmentedControl
          options={[
            { value: 'active', label: 'Active' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'finished', label: 'Finished' },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Challenge status"
        />
      </View>
      <Section>
        {mine.isPending ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : mine.isError ? (
          <ErrorState message="We could not load your challenges." onRetry={() => void mine.refetch()} />
        ) : entries.length ? (
          entries.map((e) => <ChallengeCard key={e.challenge.id} challenge={e.challenge} myValue={Number(e.participant.progress_value)} completed={!!e.participant.completed_at} />)
        ) : (
          <EmptyState
            icon={tab === 'finished' ? 'trophy-outline' : 'flag-plus-outline'}
            title={tab === 'active' ? 'No active challenges' : tab === 'upcoming' ? 'Nothing scheduled' : 'No finished challenges yet'}
            message="Join a weekly goal, a team battle or a community quest, or create one for your friends."
            actionLabel="Explore challenges"
            onAction={() => router.push('/explore')}
          />
        )}
      </Section>
    </Screen>
  );
}
