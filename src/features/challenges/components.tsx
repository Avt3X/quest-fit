import { router } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';

import { HeroGradient, ThemePattern } from '@/components/brand/ThemePattern';
import { Avatar, Card, Chip, Icon, type IconName, ProgressBar, Text, toIconName } from '@/components/ui';
import { ACTIVITY_TYPE_META, type ActivityType } from '@/domain/activity-types';
import { progressFraction, timeRemainingLabel, timeUntilLabel } from '@/domain/progress';
import { ordinal, rankWithTies } from '@/domain/ranking';
import { useUnits } from '@/hooks/useUnits';
import { haptics } from '@/lib/haptics';
import type { ThemePattern as Pattern } from '@/theme/registry';
import { useAppTheme } from '@/theme/ThemeProvider';

import { type ChallengeTeam, type ChallengeWithTeams, type LeaderboardEntry, challengeStatus } from './api';

const COVERS: Record<string, { colors: [string, string]; pattern: Pattern; accent: string }> = {
  ember: { colors: ['#4A1A0C', '#1A1210'], pattern: 'embers', accent: '#FF7A45' },
  meadow: { colors: ['#123828', '#0E1A16'], pattern: 'contours', accent: '#7CCB4E' },
  duel: { colors: ['#2A1640', '#121025'], pattern: 'runes', accent: '#B58CFF' },
  summit: { colors: ['#10304F', '#0D141F'], pattern: 'peaks', accent: '#4FB7FF' },
  alps: { colors: ['#2B2340', '#121319'], pattern: 'peaks', accent: '#FF8FA3' },
  trailhead: { colors: ['#0C2A25', '#0E1A1F'], pattern: 'contours', accent: '#1FC99A' },
  aurora: { colors: ['#1A1238', '#0D1222'], pattern: 'aurora', accent: '#4DE8C2' },
  lantern: { colors: ['#151634', '#0D0F1F'], pattern: 'aurora', accent: '#FFB347' },
  mythic: { colors: ['#2B2310', '#0E0D0B'], pattern: 'runes', accent: '#F5C451' },
};

export const COVER_KEYS = Object.keys(COVERS);

export const MODE_META: Record<ChallengeWithTeams['mode'], { label: string; icon: IconName; description: string }> = {
  individual: { label: 'Solo goal', icon: 'flag-variant', description: 'Reach the goal on your own. Everyone who finishes wins.' },
  competitive: { label: 'Competition', icon: 'podium', description: 'Separate scores, one leaderboard. Highest total wins.' },
  collaborative: { label: 'Community goal', icon: 'account-group', description: 'Everyone’s distance adds up to one shared goal.' },
  team: { label: 'Team battle', icon: 'sword-cross', description: 'Join a team. Team totals decide the winner.' },
};

export function ChallengeCover({ cover, mode, height = 96, style }: { cover: string; mode: ChallengeWithTeams['mode']; height?: number; style?: ViewStyle }) {
  const c = COVERS[cover] ?? COVERS.trailhead;
  return (
    <View style={[{ height, overflow: 'hidden', justifyContent: 'flex-end', padding: 12 }, style]}>
      <HeroGradient colors={c.colors} id={`cover-${cover}`} />
      <ThemePattern pattern={c.pattern} color={c.accent} secondary="#FFFFFF" opacity={0.45} />
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={MODE_META[mode].icon} size={20} color={c.accent} />
      </View>
    </View>
  );
}

export function TypeIcons({ types, color }: { types: readonly ActivityType[]; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Counts: ${types.map((t) => ACTIVITY_TYPE_META[t].label).join(', ')}`}>
      {types.slice(0, 5).map((t) => (
        <Icon key={t} name={toIconName(ACTIVITY_TYPE_META[t].icon)} size={16} color={color ?? colors.textMuted} />
      ))}
      {types.length > 5 ? <Text variant="caption" tone="muted">+{types.length - 5}</Text> : null}
    </View>
  );
}

export function statusLabel(c: ChallengeWithTeams, now = new Date()): string {
  const status = challengeStatus(c, now);
  if (status === 'upcoming') return timeUntilLabel(new Date(c.starts_at), now);
  if (status === 'active') return timeRemainingLabel(new Date(c.ends_at), now);
  if (status === 'grace') return 'Ended · late uploads open';
  return 'Ended';
}

export interface ChallengeCardProps {
  challenge: ChallengeWithTeams;
  /** The viewer's own progress (null if not joined). */
  myValue?: number | null;
  completed?: boolean;
  width?: number;
}

export function ChallengeCard({ challenge, myValue, completed, width }: ChallengeCardProps) {
  const { colors, spacing } = useAppTheme();
  const units = useUnits();
  const joined = myValue !== undefined && myValue !== null;
  const shared = challenge.mode === 'collaborative';
  const value = shared ? Number(challenge.total_progress) : myValue ?? 0;
  const target = challenge.target_value ? Number(challenge.target_value) : null;
  const fraction = progressFraction(value, target);
  return (
    <Card
      padded={false}
      style={width ? { width } : undefined}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } })}
      accessibilityLabel={`${challenge.title}. ${MODE_META[challenge.mode].label}. ${statusLabel(challenge)}`}
    >
      <ChallengeCover cover={challenge.cover_art} mode={challenge.mode} height={84} />
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="caption" tone="accent" style={{ flex: 1 }} numberOfLines={1}>
            {MODE_META[challenge.mode].label.toUpperCase()}
          </Text>
          {completed ? <Chip label="Completed" icon="check-decagram" size="sm" tone="accent" /> : joined ? <Chip label="Joined" size="sm" /> : null}
        </View>
        <Text variant="heading" numberOfLines={2}>
          {challenge.title}
        </Text>
        {target ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={fraction} height={8} accessibilityLabel={`${Math.round(fraction * 100)} percent`} />
            <Text variant="small" tone="muted" tabular>
              {joined || shared ? `${units.metric(challenge.metric, value)} of ` : 'Goal: '}
              {units.metric(challenge.metric, target)}
              {shared ? ' together' : ''}
            </Text>
          </View>
        ) : (
          <Text variant="small" tone="muted">
            {joined ? `Your total: ${units.metric(challenge.metric, value)}` : 'Highest total wins'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="clock-outline" size={14} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {statusLabel(challenge)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="account-multiple" size={14} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {challenge.participant_count.toLocaleString('en-US')}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

export function LeaderboardList({
  entries,
  metric,
  teams,
  emptyLabel = 'No one has logged progress yet.',
}: {
  entries: LeaderboardEntry[];
  metric: ChallengeWithTeams['metric'];
  teams?: ChallengeTeam[];
  emptyLabel?: string;
}) {
  const { colors, spacing, radii } = useAppTheme();
  const units = useUnits();
  if (!entries.length) {
    return (
      <Text variant="small" tone="muted" style={{ paddingVertical: spacing.md }}>
        {emptyLabel}
      </Text>
    );
  }
  return (
    <View>
      {entries.map((e, i) => {
        // The caller's own row is appended after the top N when they rank lower.
        const gap = e.is_me && i > 0 && i === entries.length - 1 && e.rank > i + 1;
        const team = teams?.find((t) => t.id === e.team_id);
        const medal = e.rank === 1 ? '#F2B544' : e.rank === 2 ? '#AEB8C4' : e.rank === 3 ? '#C98A5A' : null;
        return (
          <View key={e.user_id}>
            {gap ? <Text variant="caption" tone="subtle" align="center">···</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${ordinal(e.rank)}: ${e.is_me ? 'You' : e.display_name}, ${units.metric(metric, e.value)}`}
              onPress={() => {
                haptics.tap();
                router.push({ pathname: '/user/[id]', params: { id: e.user_id } });
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: e.is_me ? colors.accentSoft : 'transparent',
              }}
            >
              <View style={{ width: 30, alignItems: 'center' }}>
                {medal ? <Icon name="medal" size={22} color={medal} /> : <Text variant="bodyStrong" tone="muted" tabular>{e.rank}</Text>}
              </View>
              <Avatar name={e.display_name} uri={e.avatar_url} size={36} ring={team?.color} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {e.is_me ? 'You' : e.display_name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {team ? team.name : `@${e.username}`} · Lv {e.level}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyStrong" tabular>
                  {units.metric(metric, e.value)}
                </Text>
                {e.completed_at ? <Icon name="check-decagram" size={14} color={colors.accentText} accessibilityLabel="Completed" /> : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function TeamStandings({ teams, metric, target, myTeamId }: { teams: ChallengeTeam[]; metric: ChallengeWithTeams['metric']; target: number | null; myTeamId: string | null }) {
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const ranked = rankWithTies(teams, (t) => Number(t.total_progress));
  const max = Math.max(target ?? 0, ...teams.map((t) => Number(t.total_progress)), 1);
  return (
    <View style={{ gap: spacing.md }}>
      {ranked.map((t) => (
        <View key={t.id} style={{ gap: 6 }} accessible accessibilityLabel={`${ordinal(t.rank)}: ${t.name}, ${units.metric(metric, Number(t.total_progress))}, ${t.member_count} members`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.color }} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t.name}
              {t.id === myTeamId ? <Text variant="small" tone="accent"> · your team</Text> : null}
            </Text>
            <Text variant="bodyStrong" tabular>
              {units.metric(metric, Number(t.total_progress))}
            </Text>
          </View>
          <ProgressBar value={Number(t.total_progress) / max} color={t.color} height={10} />
          <Text variant="caption" tone="muted">
            {ordinal(t.rank)} · {t.member_count} {t.member_count === 1 ? 'member' : 'members'}
            {t.goal_reached_at ? ' · goal reached' : ''}
          </Text>
        </View>
      ))}
      {!teams.length ? <Text variant="small" style={{ color: colors.textMuted }}>No teams yet.</Text> : null}
    </View>
  );
}
