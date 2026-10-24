import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ActivityType } from '@/domain/activity-types';
import { useAuth } from '@/features/auth/AuthProvider';
import { qk } from '@/lib/query-keys';
import { type Enums, type Tables, supabase, unwrap, unwrapMaybe } from '@/lib/supabase';
import type { Json } from '@/types/database';

export type Challenge = Tables<'challenges'>;
export type ChallengeTeam = Tables<'challenge_teams'>;
export type ChallengeParticipant = Tables<'challenge_participants'>;
export type ChallengeMode = Enums<'challenge_mode'>;
export type ChallengeMetric = Enums<'challenge_metric'>;

export interface ChallengeWithTeams extends Challenge {
  challenge_teams: ChallengeTeam[];
}

export type ChallengeStatus = 'upcoming' | 'active' | 'grace' | 'ended';

export function challengeStatus(c: Pick<Challenge, 'starts_at' | 'ends_at' | 'submission_grace_hours' | 'finalized_at'>, now = new Date()): ChallengeStatus {
  const start = new Date(c.starts_at).getTime();
  const end = new Date(c.ends_at).getTime();
  if (now.getTime() < start) return 'upcoming';
  if (now.getTime() < end) return 'active';
  if (!c.finalized_at && now.getTime() <= end + c.submission_grace_hours * 3600_000) return 'grace';
  return 'ended';
}

export interface ChallengeFilters {
  search: string;
  types: ActivityType[];
  modes: ChallengeMode[];
  period: Enums<'challenge_period'> | null;
}

export function useExploreChallenges(filters: ChallengeFilters) {
  return useQuery({
    queryKey: qk.challenges(filters),
    queryFn: async (): Promise<ChallengeWithTeams[]> => {
      let query = supabase
        .from('challenges')
        .select('*, challenge_teams(*)')
        .eq('visibility', 'public')
        .gt('ends_at', new Date().toISOString())
        .order('is_featured', { ascending: false })
        .order('participant_count', { ascending: false })
        .order('ends_at')
        .limit(60);
      if (filters.search.trim()) query = query.ilike('title', `%${filters.search.trim().replace(/[%_]/g, '')}%`);
      if (filters.types.length) query = query.overlaps('activity_types', filters.types);
      if (filters.modes.length) query = query.in('mode', filters.modes);
      if (filters.period) query = query.eq('period', filters.period);
      return unwrap(await query) as ChallengeWithTeams[];
    },
  });
}

export interface MyChallengeEntry {
  participant: ChallengeParticipant;
  challenge: ChallengeWithTeams;
}

export function useMyChallenges() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.myChallenges,
    enabled: !!userId,
    queryFn: async (): Promise<MyChallengeEntry[]> => {
      const rows = unwrap(
        await supabase
          .from('challenge_participants')
          .select('*, challenge:challenges(*, challenge_teams(*))')
          .eq('user_id', userId as string)
          .order('joined_at', { ascending: false })
          .limit(100),
      );
      return rows
        .filter((r) => r.challenge)
        .map((r) => {
          const { challenge, ...participant } = r;
          return { participant: participant as ChallengeParticipant, challenge: challenge as unknown as ChallengeWithTeams };
        });
    },
  });
}

export interface ChallengeDetail {
  challenge: ChallengeWithTeams;
  me: ChallengeParticipant | null;
  creator: { id: string; display_name: string; username: string } | null;
}

export function useChallenge(id: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.challenge(id),
    queryFn: async (): Promise<ChallengeDetail> => {
      const challenge = unwrap(await supabase.from('challenges').select('*, challenge_teams(*)').eq('id', id).single()) as ChallengeWithTeams;
      const [me, creator] = await Promise.all([
        supabase.from('challenge_participants').select('*').eq('challenge_id', id).eq('user_id', userId as string).maybeSingle(),
        challenge.created_by
          ? supabase.from('profiles').select('id, display_name, username').eq('id', challenge.created_by).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      return { challenge, me: unwrapMaybe(me), creator: unwrapMaybe(creator) };
    },
  });
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  team_id: string | null;
  value: number;
  completed_at: string | null;
  is_me: boolean;
}

export function useChallengeLeaderboard(id: string, scope: 'all' | 'friends') {
  return useQuery({
    queryKey: qk.leaderboard(id, scope),
    queryFn: async (): Promise<LeaderboardEntry[]> =>
      unwrap(await supabase.rpc('get_challenge_leaderboard', { p_challenge_id: id, p_scope: scope, p_limit: 100 })).map((r) => ({
        ...r,
        rank: Number(r.rank),
        value: Number(r.value),
      })),
  });
}

function useInvalidateChallenges() {
  const client = useQueryClient();
  return (id?: string) => {
    if (id) client.invalidateQueries({ queryKey: qk.challenge(id) });
    client.invalidateQueries({ queryKey: qk.challengesAll });
    client.invalidateQueries({ queryKey: qk.myChallenges });
    client.invalidateQueries({ queryKey: qk.leaderboardAll });
    client.invalidateQueries({ queryKey: qk.achievements });
    client.invalidateQueries({ queryKey: ['me'] });
  };
}

export function useJoinChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (params: { challengeId: string; teamId?: string | null; inviteCode?: string | null }) =>
      unwrap(
        await supabase.rpc('join_challenge', {
          p_challenge_id: params.challengeId,
          p_team_id: params.teamId ?? undefined,
          p_invite_code: params.inviteCode ?? undefined,
        }),
      ),
    onSuccess: (_d, v) => invalidate(v.challengeId),
  });
}

export function useJoinChallengeByCode() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (code: string) => unwrap(await supabase.rpc('join_challenge_by_code', { p_code: code })),
    onSuccess: (id) => invalidate(id),
  });
}

export function useLeaveChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (challengeId: string) => unwrap(await supabase.rpc('leave_challenge', { p_challenge_id: challengeId })),
    onSuccess: (_d, id) => invalidate(id),
  });
}

export interface CreateChallengeInput {
  title: string;
  description?: string;
  mode: ChallengeMode;
  metric: ChallengeMetric;
  target_value: number | null;
  activity_types: ActivityType[];
  allow_manual: boolean;
  period: Enums<'challenge_period'>;
  recurrence: Enums<'challenge_recurrence'>;
  timezone: string;
  starts_at: string;
  ends_at: string;
  visibility: 'public' | 'private';
  teams?: { name: string; color: string }[];
  cover_art?: string;
}

export function useCreateChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (input: CreateChallengeInput) => unwrap(await supabase.rpc('create_challenge', { p: input as unknown as Json })),
    onSuccess: (id) => invalidate(id),
  });
}

export function useInviteToChallenge(challengeId: string) {
  return useMutation({
    mutationFn: async (userIds: string[]) => unwrap(await supabase.rpc('invite_to_challenge', { p_challenge_id: challengeId, p_user_ids: userIds })),
  });
}

let lastHousekeeping = 0;

/** Rolls recurring challenges forward and finalizes ended ones; throttled per app session. */
export function useChallengeHousekeeping() {
  const { userId } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!userId || Date.now() - lastHousekeeping < 10 * 60_000) return;
    lastHousekeeping = Date.now();
    supabase
      .rpc('refresh_challenges')
      .then(({ data }) => {
        const result = data as { rolled?: number; finalized?: number } | null;
        if (result && ((result.rolled ?? 0) > 0 || (result.finalized ?? 0) > 0)) {
          client.invalidateQueries({ queryKey: qk.challengesAll });
          client.invalidateQueries({ queryKey: qk.myChallenges });
        }
      })
      .then(undefined, () => {
        lastHousekeeping = 0;
      });
  }, [userId, client]);
}
