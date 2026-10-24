import { View } from 'react-native';

import { Card, ErrorState, LoadingState, ProgressBar, Screen, ScreenHeader, Section, Text } from '@/components/ui';
import { useAchievementProgress, useXpHistory } from '@/features/gamification/api';
import { AchievementBadge, LevelCard } from '@/features/gamification/components';
import { useMyProfile } from '@/features/profile/api';
import { useUnits } from '@/hooks/useUnits';
import { relativeTime } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';

const REASONS: Record<string, string> = {
  activity: 'Activity',
  challenge_completed: 'Challenge completed',
  challenge_podium: 'Challenge result',
  achievement: 'Achievement',
  journey_checkpoint: 'Journey checkpoint',
  journey_completed: 'Journey completed',
};

export default function AchievementsScreen() {
  const { spacing } = useAppTheme();
  const units = useUnits();
  const me = useMyProfile();
  const list = useAchievementProgress();
  const xp = useXpHistory();
  const categories = Array.from(new Set((list.data ?? []).map((a) => a.category)));

  const format = (ruleType: string, v: number) => (ruleType === 'total_distance' || ruleType === 'single_activity_distance' ? units.distance(v, 0) : v.toLocaleString('en-US'));

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <ScreenHeader title="Achievements & XP" />
      {me.data ? (
        <Card>
          <LevelCard xpTotal={Number(me.data.xp.xp_total)} />
          <Text variant="caption" tone="subtle" style={{ marginTop: spacing.sm }}>
            {Number(me.data.xp.xp_total).toLocaleString('en-US')} XP total. Activity XP is capped at 400 per day so rest and recovery never cost you.
          </Text>
        </Card>
      ) : null}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message="Could not load achievements." onRetry={() => void list.refetch()} />
      ) : (
        categories.map((cat) => (
          <Section key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)}>
            {(list.data ?? [])
              .filter((a) => a.category === cat)
              .map((a) => {
                const fraction = a.target_value > 0 ? Math.min(1, a.current_value / a.target_value) : 0;
                return (
                  <Card key={a.id} tone={a.earned_at ? 'accent' : 'surface'} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <AchievementBadge achievement={a} size={48} showProgress={false} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="bodyStrong">{a.title}</Text>
                      <Text variant="small" tone="muted">
                        {a.description}
                      </Text>
                      {a.earned_at ? (
                        <Text variant="caption" tone="accent">
                          Earned {new Date(a.earned_at).toLocaleDateString()} {a.xp_reward ? `· +${a.xp_reward} XP` : ''}
                        </Text>
                      ) : (
                        <>
                          <ProgressBar value={fraction} height={6} />
                          <Text variant="caption" tone="muted" tabular>
                            {format(a.rule_type, a.current_value)} / {format(a.rule_type, a.target_value)} {a.xp_reward ? `· ${a.xp_reward} XP` : ''}
                          </Text>
                        </>
                      )}
                    </View>
                  </Card>
                );
              })}
          </Section>
        ))
      )}
      <Section title="Recent XP">
        <Card style={{ gap: spacing.sm }}>
          {(xp.data ?? []).length ? (
            (xp.data ?? []).map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small">
                  {REASONS[t.reason] ?? t.reason} <Text variant="caption" tone="subtle">· {relativeTime(t.created_at)}</Text>
                </Text>
                <Text variant="smallStrong" tone="secondary" tabular>
                  +{t.amount}
                </Text>
              </View>
            ))
          ) : (
            <Text variant="small" tone="muted">
              No XP yet. Record an activity to earn your first.
            </Text>
          )}
        </Card>
      </Section>
    </Screen>
  );
}
