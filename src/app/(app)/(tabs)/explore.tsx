import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, CardSkeleton, Chip, ChipRow, EmptyState, ErrorState, Screen, ScreenHeader, Section, SegmentedControl, Text, TextField, toIconName } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from '@/domain/activity-types';
import { type ChallengeFilters, type ChallengeMode, useExploreChallenges, useMyChallenges } from '@/features/challenges/api';
import { ChallengeCard, MODE_META } from '@/features/challenges/components';
import { useJourneys, useMyExpeditions } from '@/features/journeys/api';
import { JourneyCard } from '@/features/journeys/components';
import { useMyProfile } from '@/features/profile/api';
import { useProfileSearch } from '@/features/social/api';
import { FriendAction, UserRow } from '@/features/social/components';
import type { Enums } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

type Tab = 'challenges' | 'journeys' | 'people';
const PERIODS: { value: Enums<'challenge_period'>; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

export default function ExploreScreen() {
  const { spacing } = useAppTheme();
  const [tab, setTab] = useState<Tab>('challenges');
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [modes, setModes] = useState<ChallengeMode[]>([]);
  const [period, setPeriod] = useState<Enums<'challenge_period'> | null>(null);
  const filters: ChallengeFilters = useMemo(() => ({ search, types, modes, period }), [search, types, modes, period]);
  const challenges = useExploreChallenges(filters);
  const mine = useMyChallenges();
  const me = useMyProfile();
  const journeys = useJourneys();
  const expeditions = useMyExpeditions();
  const people = useProfileSearch(tab === 'people' ? search : '');

  const myMap = new Map((mine.data ?? []).map((m) => [m.challenge.id, m.participant]));
  const list = challenges.data ?? [];
  const preferred = me.data?.profile.preferred_activity_types ?? [];
  const filtersActive = !!search || types.length > 0 || modes.length > 0 || period !== null;
  const featured = list.filter((c) => c.is_featured && !myMap.has(c.id));
  const recommended = list.filter((c) => !myMap.has(c.id) && preferred.length > 0 && c.activity_types.some((t) => preferred.includes(t))).slice(0, 8);
  const community = list.filter((c) => c.mode === 'collaborative' || c.mode === 'team');
  const competitions = list.filter((c) => c.mode === 'competitive' || (c.period === 'weekly' && c.mode === 'individual'));

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const card = (c: (typeof list)[number], width?: number) => {
    const p = myMap.get(c.id);
    return <ChallengeCard key={c.id} challenge={c} myValue={p ? Number(p.progress_value) : null} completed={!!p?.completed_at} width={width} />;
  };

  return (
    <Screen testID="explore-screen">
      <ScreenHeader title="Explore" back={false} right={<Button label="Code" icon="ticket-confirmation-outline" size="sm" variant="outline" onPress={() => router.push('/join')} />} />
      <SegmentedControl
        options={[
          { value: 'challenges', label: 'Challenges', icon: 'flag-outline' },
          { value: 'journeys', label: 'Journeys', icon: 'map-outline' },
          { value: 'people', label: 'People', icon: 'account-search-outline' },
        ]}
        value={tab}
        onChange={setTab}
        accessibilityLabel="Explore section"
      />
      {tab !== 'journeys' ? (
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label={tab === 'people' ? 'Search people by name or username' : 'Search challenges'}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
            placeholder={tab === 'people' ? 'e.g. nino' : 'e.g. 100 km'}
          />
        </View>
      ) : null}

      {tab === 'challenges' ? (
        <>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <ChipRow>
              {ACTIVITY_TYPES.map((t) => (
                <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} selected={types.includes(t)} onPress={() => setTypes((cur) => toggle(cur, t))} size="sm" />
              ))}
            </ChipRow>
            <ChipRow>
              {(Object.keys(MODE_META) as ChallengeMode[]).map((m) => (
                <Chip key={m} label={MODE_META[m].label} icon={MODE_META[m].icon} selected={modes.includes(m)} onPress={() => setModes((cur) => toggle(cur, m))} size="sm" />
              ))}
              {PERIODS.map((p) => (
                <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod((cur) => (cur === p.value ? null : p.value))} size="sm" />
              ))}
            </ChipRow>
          </View>

          {challenges.isPending ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <CardSkeleton />
              <CardSkeleton />
            </View>
          ) : challenges.isError ? (
            <ErrorState message="We could not load challenges." onRetry={() => void challenges.refetch()} />
          ) : filtersActive ? (
            <Section title={`${list.length} ${list.length === 1 ? 'challenge' : 'challenges'}`}>
              {list.length ? list.map((c) => card(c)) : <EmptyState compact icon="flag-remove-outline" title="No matches" message="Try fewer filters, or create your own challenge." actionLabel="Create a challenge" onAction={() => router.push('/challenge/create')} />}
            </Section>
          ) : (
            <>
              {featured.length ? (
                <Section title="Featured">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                    {featured.map((c) => card(c, 270))}
                  </ScrollView>
                </Section>
              ) : null}
              {recommended.length ? (
                <Section title="Recommended for you">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                    {recommended.map((c) => card(c, 270))}
                  </ScrollView>
                </Section>
              ) : null}
              {community.length ? <Section title="Community & team goals">{community.map((c) => card(c))}</Section> : null}
              {competitions.length ? <Section title="Weekly & monthly competitions">{competitions.map((c) => card(c))}</Section> : null}
              <Section title="All open challenges">{list.map((c) => card(c))}</Section>
              <Button label="Create your own challenge" icon="plus" variant="outline" onPress={() => router.push('/challenge/create')} style={{ marginTop: spacing.lg }} fullWidth />
            </>
          )}
        </>
      ) : null}

      {tab === 'journeys' ? (
        <Section>
          {journeys.isPending ? (
            <CardSkeleton />
          ) : (
            (journeys.data ?? []).map((j) => {
              const active = expeditions.data?.find((e) => e.expedition.journey_id === j.id && e.member.is_active);
              return <JourneyCard key={j.id} journey={j} expedition={active?.expedition ?? null} />;
            })
          )}
        </Section>
      ) : null}

      {tab === 'people' ? (
        <Section>
          {search.trim().length < 2 ? (
            <EmptyState compact icon="account-search-outline" title="Find friends" message="Search by name or username to add friends, compare progress and invite them to challenges." />
          ) : people.isPending ? (
            <CardSkeleton />
          ) : people.data?.length ? (
            people.data.map((p) => (
              <UserRow key={p.id} id={p.id} displayName={p.display_name} username={p.username} avatarUrl={p.avatar_url} level={p.level} right={<FriendAction userId={p.id} relationship={p.friendship} />} />
            ))
          ) : (
            <Text variant="body" tone="muted">
              Nobody found for “{search.trim()}”.
            </Text>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
