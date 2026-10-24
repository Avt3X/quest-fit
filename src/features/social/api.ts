import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/query-keys';
import { supabase, unwrap } from '@/lib/supabase';

export type Relationship = 'friends' | 'outgoing' | 'incoming' | 'none';

export interface FriendEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  status: Relationship;
  since: string;
}

export function useFriends() {
  return useQuery({
    queryKey: qk.friends,
    queryFn: async (): Promise<FriendEntry[]> => unwrap(await supabase.rpc('get_friends')) as FriendEntry[],
  });
}

export interface SearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  friendship: Relationship;
}

export function useProfileSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: qk.search(q),
    enabled: q.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<SearchResult[]> => unwrap(await supabase.rpc('search_profiles', { p_query: q, p_limit: 25 })) as SearchResult[],
  });
}

function useInvalidateSocial() {
  const client = useQueryClient();
  return (userId?: string) => {
    client.invalidateQueries({ queryKey: qk.friends });
    client.invalidateQueries({ queryKey: ['search'] });
    client.invalidateQueries({ queryKey: qk.feed });
    client.invalidateQueries({ queryKey: qk.blocked });
    client.invalidateQueries({ queryKey: qk.achievements });
    if (userId) client.invalidateQueries({ queryKey: qk.publicProfile(userId) });
  };
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (userId: string) => unwrap(await supabase.rpc('send_friend_request', { p_user_id: userId })),
    onSuccess: (_d, userId) => invalidate(userId),
  });
}

export function useRespondFriendRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (params: { userId: string; accept: boolean }) =>
      unwrap(await supabase.rpc('respond_friend_request', { p_user_id: params.userId, p_accept: params.accept })),
    onSuccess: (_d, v) => invalidate(v.userId),
  });
}

export function useRemoveFriend() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (userId: string) => unwrap(await supabase.rpc('remove_friend', { p_user_id: userId })),
    onSuccess: (_d, userId) => invalidate(userId),
  });
}

export function useBlockUser() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (userId: string) => unwrap(await supabase.rpc('block_user', { p_user_id: userId })),
    onSuccess: (_d, userId) => invalidate(userId),
  });
}

export function useUnblockUser() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (userId: string) => unwrap(await supabase.rpc('unblock_user', { p_user_id: userId })),
    onSuccess: (_d, userId) => invalidate(userId),
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: qk.blocked,
    queryFn: async () => unwrap(await supabase.rpc('get_blocked_users')),
  });
}

export interface GlobalLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  value: number;
  is_me: boolean;
}

export function useLeaderboard(period: 'week' | 'month' | 'all', scope: 'friends' | 'global', metric: 'distance' | 'duration' | 'count') {
  return useQuery({
    queryKey: qk.globalLeaderboard(period, scope, metric),
    queryFn: async (): Promise<GlobalLeaderboardEntry[]> =>
      unwrap(await supabase.rpc('get_leaderboard', { p_period: period, p_scope: scope, p_metric: metric, p_limit: 50 })).map((r) => ({
        ...r,
        rank: Number(r.rank),
        value: Number(r.value),
      })),
  });
}
