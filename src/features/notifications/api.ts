import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { qk } from '@/lib/query-keys';
import { type Tables, supabase, unwrap } from '@/lib/supabase';

export type NotificationRow = Tables<'notifications'>;

export function useNotifications() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.notifications,
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('notifications')
          .select('*, actor:profiles!notifications_actor_id_fkey(id, display_name, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(100),
      ),
  });
}

export function useUnreadCount() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.unreadCount,
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.notifications });
      client.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });
}

export function useDeleteNotification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('notifications').delete().eq('id', id)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.notifications });
      client.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });
}

export interface PendingInvitation {
  id: string;
  kind: 'challenge' | 'expedition';
  challenge_id: string | null;
  expedition_id: string | null;
  expires_at: string;
  inviter: { id: string; display_name: string; avatar_url: string | null } | null;
  challenge: { id: string; title: string; mode: string; ends_at: string } | null;
  expedition: { id: string; name: string | null; journey_id: string } | null;
}

export function useInvitations() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.invitations,
    enabled: !!userId,
    queryFn: async (): Promise<PendingInvitation[]> => {
      const rows = unwrap(
        await supabase
          .from('invitations')
          .select(
            'id, kind, challenge_id, expedition_id, expires_at, inviter:profiles!invitations_inviter_id_fkey(id, display_name, avatar_url), challenge:challenges(id, title, mode, ends_at), expedition:journey_expeditions(id, name, journey_id)',
          )
          .eq('invitee_id', userId as string)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      );
      return rows as unknown as PendingInvitation[];
    },
  });
}

export function useRespondInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; accept: boolean; teamId?: string }) =>
      unwrap(await supabase.rpc('respond_invitation', { p_invitation_id: params.id, p_accept: params.accept, p_team_id: params.teamId })) as unknown as {
        status: string;
        challenge_id?: string;
        expedition_id?: string;
      },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.invitations });
      client.invalidateQueries({ queryKey: qk.myChallenges });
      client.invalidateQueries({ queryKey: qk.myExpeditions });
    },
  });
}
