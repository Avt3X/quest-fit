import { View } from 'react-native';

import { CardSkeleton, ErrorState, Screen, ScreenHeader, Section } from '@/components/ui';
import { useJourneys, useMyExpeditions } from '@/features/journeys/api';
import { JourneyCard } from '@/features/journeys/components';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function JourneysScreen() {
  const { spacing } = useAppTheme();
  const journeys = useJourneys();
  const mine = useMyExpeditions();
  const completed = (mine.data ?? []).filter((e) => e.expedition.status === 'completed');
  return (
    <Screen refreshing={journeys.isRefetching} onRefresh={() => void journeys.refetch()}>
      <ScreenHeader title="Epic journeys" subtitle="Every eligible kilometre you move moves your marker along the route." />
      {journeys.isPending ? (
        <View style={{ gap: spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : journeys.isError ? (
        <ErrorState message="We could not load journeys." onRetry={() => void journeys.refetch()} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {(journeys.data ?? []).map((j) => {
            const active = mine.data?.find((e) => e.expedition.journey_id === j.id && e.member.is_active);
            return <JourneyCard key={j.id} journey={j} expedition={active?.expedition ?? null} />;
          })}
        </View>
      )}
      {completed.length ? (
        <Section title="Completed">
          {completed.map((e) => {
            const j = journeys.data?.find((x) => x.id === e.expedition.journey_id);
            return j ? <JourneyCard key={e.expedition.id} journey={j} expedition={e.expedition} /> : null;
          })}
        </Section>
      ) : null}
    </Screen>
  );
}
