import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { ActivitySource, ActivityType, Visibility } from '@/domain/activity-types';
import { qk } from '@/lib/query-keys';
import { type Tables, supabase, unwrap, unwrapMaybe } from '@/lib/supabase';
import type { Json } from '@/types/database';

export interface Actor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  equipped_theme_id: string | null;
}

export interface FeedActivity {
  id: string;
  type: ActivityType;
  source: ActivitySource;
  title: string;
  description: string | null;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number | null;
  avg_speed_mps: number;
  started_at: string;
  visibility: Visibility;
  route_preview: Json | null;
  is_eligible: boolean;
  reaction_count: number;
  comment_count: number;
  reacted: boolean;
}

export type FeedItem =
  | { kind: 'activity'; key: string; occurredAt: string; actor: Actor; activity: FeedActivity }
  | { kind: 'achievement'; key: string; occurredAt: string; actor: Actor; achievement: { achievement_id: string; title: string; icon: string; tier: string; description: string } }
  | { kind: 'challenge_completed'; key: string; occurredAt: string; actor: Actor; challenge: { challenge_id: string; title: string; mode: string; metric: 'distance' | 'duration' | 'count'; value: number } }
  | { kind: 'journey_completed'; key: string; occurredAt: string; actor: Actor; journey: { journey_slug: string; title: string; art_key: string; total_m: number; mode: string } };

const FEED_PAGE = 15;

function toFeedItem(row: { kind: string; item_id: string; occurred_at: string; actor: Json; payload: Json }): FeedItem | null {
  const base = { key: `${row.kind}:${row.item_id}`, occurredAt: row.occurred_at, actor: row.actor as unknown as Actor };
  switch (row.kind) {
    case 'activity':
      return { ...base, kind: 'activity', activity: row.payload as unknown as FeedActivity };
    case 'achievement':
      return { ...base, kind: 'achievement', achievement: row.payload as unknown as Extract<FeedItem, { kind: 'achievement' }>['achievement'] };
    case 'challenge_completed':
      return { ...base, kind: 'challenge_completed', challenge: row.payload as unknown as Extract<FeedItem, { kind: 'challenge_completed' }>['challenge'] };
    case 'journey_completed':
      return { ...base, kind: 'journey_completed', journey: row.payload as unknown as Extract<FeedItem, { kind: 'journey_completed' }>['journey'] };
    default:
      return null;
  }
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: qk.feed,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const rows = unwrap(await supabase.rpc('get_feed', { p_before: pageParam ?? undefined, p_limit: FEED_PAGE }));
      return rows.map(toFeedItem).filter((x): x is FeedItem => x !== null);
    },
    getNextPageParam: (last) => (last.length < FEED_PAGE ? null : last[last.length - 1].occurredAt),
  });
}

export type ActivityRow = Tables<'activities'>;
export type HistoryRange = '7d' | '30d' | '90d' | '365d' | 'all';

const HISTORY_PAGE = 20;

export function rangeStart(range: HistoryRange, now = new Date()): Date | null {
  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, all: 0 }[range];
  return days ? new Date(now.getTime() - days * 86_400_000) : null;
}

export function useMyActivities(userId: string, filters: { types: ActivityType[]; range: HistoryRange }) {
  return useInfiniteQuery({
    queryKey: qk.myActivities({ types: filters.types, range: filters.range }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase.from('activities').select('*').eq('user_id', userId).order('started_at', { ascending: false });
      if (filters.types.length) query = query.in('type', filters.types);
      const from = rangeStart(filters.range);
      if (from) query = query.gte('started_at', from.toISOString());
      return unwrap(await query.range(pageParam, pageParam + HISTORY_PAGE - 1));
    },
    getNextPageParam: (last, pages) => (last.length < HISTORY_PAGE ? null : pages.length * HISTORY_PAGE),
  });
}

export function useUserActivities(userId: string) {
  return useQuery({
    queryKey: qk.userActivities(userId),
    queryFn: async () =>
      unwrap(await supabase.from('activities').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(10)),
  });
}

export interface ActivityDetail {
  activity: ActivityRow;
  owner: { id: string; username: string; display_name: string; avatar_url: string | null };
  reactionCount: number;
  reacted: boolean;
}

export function useActivity(id: string, viewerId: string | null) {
  return useQuery({
    queryKey: qk.activity(id),
    queryFn: async (): Promise<ActivityDetail> => {
      const activity = unwrap(await supabase.from('activities').select('*').eq('id', id).single());
      const [owner, reactions] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', activity.user_id).single(),
        supabase.from('activity_reactions').select('user_id').eq('activity_id', id),
      ]);
      const reactionRows = unwrap(reactions);
      return {
        activity,
        owner: unwrap(owner),
        reactionCount: reactionRows.length,
        reacted: reactionRows.some((r) => r.user_id === viewerId),
      };
    },
  });
}

export interface RoutePoint {
  lat: number;
  lng: number;
  t: number;
  segment: number;
}

/** Full-resolution route. Only returns data for the owner (RLS). */
export function useActivityRoute(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.activityRoute(id),
    enabled,
    queryFn: async (): Promise<RoutePoint[]> => {
      const row = unwrapMaybe(await supabase.from('activity_routes').select('points').eq('activity_id', id).maybeSingle());
      if (!row || !Array.isArray(row.points)) return [];
      return (row.points as unknown[]).flatMap((p) =>
        Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number'
          ? [{ lat: p[0], lng: p[1], t: Number(p[2]), segment: typeof p[5] === 'number' ? p[5] : 0 }]
          : [],
      );
    },
  });
}

const summarySchema = z.object({
  activity_id: z.string(),
  is_eligible: z.boolean(),
  ineligible_reason: z.string().nullable(),
  distance_m: z.number(),
  moving_time_s: z.number(),
  xp_gained: z.number(),
  xp_total: z.number(),
  level_before: z.number(),
  level_after: z.number(),
  replayed: z.boolean().optional(),
  challenges: z.array(
    z.object({
      challenge_id: z.string(),
      title: z.string(),
      mode: z.enum(['individual', 'competitive', 'collaborative', 'team']),
      metric: z.enum(['distance', 'duration', 'count']),
      value: z.number(),
      progress_value: z.number(),
      personal_value: z.number(),
      target_value: z.number().nullable(),
      completed: z.boolean(),
      completed_now: z.boolean(),
    }),
  ),
  journeys: z.array(
    z.object({
      expedition_id: z.string(),
      journey_slug: z.string(),
      journey_title: z.string(),
      mode: z.enum(['solo', 'group']),
      value_m: z.number(),
      progress_m: z.number(),
      total_m: z.number(),
      completed_now: z.boolean(),
      checkpoints: z.array(z.string()),
    }),
  ),
  achievements: z.array(z.object({ id: z.string(), title: z.string(), icon: z.string(), tier: z.string() })),
  themes: z.array(z.object({ id: z.string(), name: z.string() })),
  personal_records: z.array(z.object({ kind: z.enum(['longest_distance', 'longest_duration', 'fastest_pace']), value: z.number(), previous: z.number().nullable() })),
});
export type ActivitySummary = z.infer<typeof summarySchema>;

export function parseSummary(value: unknown): ActivitySummary | null {
  const result = summarySchema.safeParse(value);
  return result.success ? result.data : null;
}

export function useActivitySummary(activityId: string) {
  return useQuery({
    queryKey: qk.activitySummary(activityId),
    queryFn: async () => {
      const row = unwrapMaybe(await supabase.from('activity_processing').select('summary').eq('activity_id', activityId).maybeSingle());
      return row ? parseSummary(row.summary) : null;
    },
  });
}

export interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

export function useComments(activityId: string) {
  return useQuery({
    queryKey: qk.comments(activityId),
    queryFn: async (): Promise<CommentRow[]> => {
      const rows = unwrap(
        await supabase
          .from('activity_comments')
          .select('id, body, created_at, user_id, author:profiles(id, username, display_name, avatar_url)')
          .eq('activity_id', activityId)
          .order('created_at'),
      );
      return rows as unknown as CommentRow[];
    },
  });
}

export function useAddComment(activityId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => unwrap(await supabase.rpc('add_comment', { p_activity_id: activityId, p_body: body })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.comments(activityId) });
      client.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

export function useDeleteComment(activityId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => unwrap(await supabase.rpc('delete_comment', { p_comment_id: commentId })),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.comments(activityId) }),
  });
}

export function useToggleReaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      const result = unwrap(await supabase.rpc('toggle_reaction', { p_activity_id: activityId })) as unknown as { reacted: boolean; count: number };
      return { activityId, ...result };
    },
    onSuccess: ({ activityId }) => {
      client.invalidateQueries({ queryKey: qk.activity(activityId) });
      client.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

export type ActivityPatch = Partial<{
  title: string;
  description: string | null;
  visibility: Visibility;
  type: ActivityType;
  started_at: string;
  moving_time_s: number;
  elapsed_time_s: number;
  distance_m: number;
}>;

function invalidateAfterActivityChange(client: ReturnType<typeof useQueryClient>, id?: string) {
  if (id) client.invalidateQueries({ queryKey: qk.activity(id) });
  for (const key of [qk.myActivitiesAll, qk.feed, qk.statsAll, qk.records, qk.myChallenges, qk.challengesAll, qk.myExpeditions, qk.achievements, ['me'], qk.leaderboardAll]) {
    client.invalidateQueries({ queryKey: key });
  }
}

export function useInvalidateActivityData() {
  const client = useQueryClient();
  return (id?: string) => invalidateAfterActivityChange(client, id);
}

export function useUpdateActivity(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ActivityPatch) => unwrap(await supabase.rpc('update_activity', { p_activity_id: id, p_patch: patch as Json })),
    onSuccess: () => invalidateAfterActivityChange(client, id),
  });
}

export function useDeleteActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('delete_activity', { p_activity_id: id })),
    onSuccess: () => invalidateAfterActivityChange(client),
  });
}

export function useRemoveRoute(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('remove_activity_route', { p_activity_id: id })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.activity(id) });
      client.invalidateQueries({ queryKey: qk.activityRoute(id) });
      client.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

export interface StatBucket {
  bucket_start: string;
  distance_m: number;
  moving_time_s: number;
  activity_count: number;
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useActivityStats(params: { from: Date; to: Date; bucket: 'day' | 'week' | 'month'; types?: ActivityType[] }) {
  const from = toDateKey(params.from);
  const to = toDateKey(params.to);
  const types = params.types?.length ? params.types : undefined;
  return useQuery({
    queryKey: qk.stats(`${from}:${to}:${params.bucket}:${(types ?? []).join(',')}`),
    queryFn: async (): Promise<StatBucket[]> =>
      unwrap(await supabase.rpc('get_activity_stats', { p_from: from, p_to: to, p_bucket: params.bucket, p_types: types })),
  });
}

export interface PersonalRecord {
  type: ActivityType;
  longest_distance: { activity_id: string; value: number; at: string } | null;
  longest_duration: { activity_id: string; value: number; at: string } | null;
  fastest_pace: { activity_id: string; value: number; at: string } | null;
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: qk.records,
    queryFn: async () => unwrap(await supabase.rpc('get_personal_records')) as unknown as PersonalRecord[],
  });
}
