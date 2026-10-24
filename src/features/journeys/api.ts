import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Vec2 } from '@/domain/progress';
import { useAuth } from '@/features/auth/AuthProvider';
import { qk } from '@/lib/query-keys';
import { type Enums, type Tables, supabase, unwrap } from '@/lib/supabase';

export type JourneyRow = Tables<'journeys'>;
export type Checkpoint = Tables<'journey_checkpoints'>;
export type Expedition = Tables<'journey_expeditions'>;
export type ExpeditionMember = Tables<'journey_expedition_members'>;

export interface Journey extends Omit<JourneyRow, 'map_path'> {
  map_path: Vec2[];
  checkpoints: Checkpoint[];
}

function parsePath(value: unknown): Vec2[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p) => (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' ? [[p[0], p[1]] as Vec2] : []));
}

function toJourney(row: JourneyRow & { journey_checkpoints: Checkpoint[] }): Journey {
  const { journey_checkpoints, map_path, ...rest } = row;
  return { ...rest, map_path: parsePath(map_path), checkpoints: [...journey_checkpoints].sort((a, b) => a.position - b.position) };
}

export function useJourneys() {
  return useQuery({
    queryKey: qk.journeys,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Journey[]> => {
      const rows = unwrap(await supabase.from('journeys').select('*, journey_checkpoints(*)').order('sort_order'));
      return rows.map(toJourney);
    },
  });
}

export function useJourney(slug: string) {
  return useQuery({
    queryKey: qk.journey(slug),
    queryFn: async (): Promise<Journey> => toJourney(unwrap(await supabase.from('journeys').select('*, journey_checkpoints(*)').eq('slug', slug).single())),
  });
}

export interface MyExpedition {
  member: ExpeditionMember;
  expedition: Expedition;
}

export function useMyExpeditions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.myExpeditions,
    enabled: !!userId,
    queryFn: async (): Promise<MyExpedition[]> => {
      const rows = unwrap(
        await supabase
          .from('journey_expedition_members')
          .select('*, expedition:journey_expeditions(*)')
          .eq('user_id', userId as string)
          .order('joined_at', { ascending: false }),
      );
      return rows
        .filter((r) => r.expedition)
        .map((r) => {
          const { expedition, ...member } = r;
          return { member: member as ExpeditionMember, expedition: expedition as unknown as Expedition };
        });
    },
  });
}

export interface ExpeditionDetail {
  expedition: Expedition;
  journey: Journey;
  members: (ExpeditionMember & { profile: { id: string; username: string; display_name: string; avatar_url: string | null } | null })[];
  unlocks: { checkpoint_id: string; reached_at: string }[];
}

export function useExpedition(id: string) {
  return useQuery({
    queryKey: qk.expedition(id),
    queryFn: async (): Promise<ExpeditionDetail> => {
      const expedition = unwrap(await supabase.from('journey_expeditions').select('*').eq('id', id).single());
      const [journey, members, unlocks] = await Promise.all([
        supabase.from('journeys').select('*, journey_checkpoints(*)').eq('id', expedition.journey_id).single(),
        supabase
          .from('journey_expedition_members')
          .select('*, profile:profiles(id, username, display_name, avatar_url)')
          .eq('expedition_id', id)
          .order('contributed_m', { ascending: false }),
        supabase.from('expedition_checkpoint_unlocks').select('checkpoint_id, reached_at').eq('expedition_id', id),
      ]);
      return {
        expedition,
        journey: toJourney(unwrap(journey)),
        members: unwrap(members) as unknown as ExpeditionDetail['members'],
        unlocks: unwrap(unlocks),
      };
    },
  });
}

function useInvalidateJourneys() {
  const client = useQueryClient();
  return (id?: string) => {
    if (id) client.invalidateQueries({ queryKey: qk.expedition(id) });
    client.invalidateQueries({ queryKey: qk.myExpeditions });
  };
}

export function useStartExpedition() {
  const invalidate = useInvalidateJourneys();
  return useMutation({
    mutationFn: async (params: { journeyId: string; mode: Enums<'journey_mode'>; name?: string }) =>
      unwrap(await supabase.rpc('start_expedition', { p_journey_id: params.journeyId, p_mode: params.mode, p_name: params.name })),
    onSuccess: (id) => invalidate(id),
  });
}

export function useJoinExpedition() {
  const invalidate = useInvalidateJourneys();
  return useMutation({
    mutationFn: async (params: { expeditionId?: string; code?: string }) =>
      unwrap(await supabase.rpc('join_expedition', { p_expedition_id: params.expeditionId, p_code: params.code })),
    onSuccess: (id) => invalidate(id),
  });
}

export function useLeaveExpedition() {
  const invalidate = useInvalidateJourneys();
  return useMutation({
    mutationFn: async (expeditionId: string) => unwrap(await supabase.rpc('leave_expedition', { p_expedition_id: expeditionId })),
    onSuccess: (_d, id) => invalidate(id),
  });
}

export function useInviteToExpedition(expeditionId: string) {
  return useMutation({
    mutationFn: async (userIds: string[]) => unwrap(await supabase.rpc('invite_to_expedition', { p_expedition_id: expeditionId, p_user_ids: userIds })),
  });
}
