import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { qk } from '@/lib/query-keys';
import { type Tables, supabase, unwrap } from '@/lib/supabase';
import { usePreferences } from '@/state/preferences-store';
import { type ThemePalette, parsePalette } from '@/theme/registry';
import type { Database } from '@/types/database';

export interface MyProfile {
  profile: Tables<'profiles'>;
  settings: Tables<'user_settings'>;
  xp: Tables<'user_xp'>;
  stats: Tables<'user_stats'>;
}

export function useMyProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.me(userId),
    enabled: !!userId,
    queryFn: async (): Promise<MyProfile> => {
      const id = userId as string;
      const [profile, settings, xp, stats] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('user_settings').select('*').eq('user_id', id).single(),
        supabase.from('user_xp').select('*').eq('user_id', id).single(),
        supabase.from('user_stats').select('*').eq('user_id', id).single(),
      ]);
      return { profile: unwrap(profile), settings: unwrap(settings), xp: unwrap(xp), stats: unwrap(stats) };
    },
  });
}

type ProfilePatch = Database['public']['Tables']['profiles']['Update'];
type SettingsPatch = Database['public']['Tables']['user_settings']['Update'];

export function useUpdateProfile() {
  const { userId } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      unwrap(await supabase.from('profiles').update(patch).eq('id', userId as string));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.me(userId) }),
  });
}

export function useUpdateSettings() {
  const { userId } = useAuth();
  const client = useQueryClient();
  const setSystem = usePreferences((s) => s.setMeasurementSystem);
  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      unwrap(await supabase.from('user_settings').update(patch).eq('user_id', userId as string));
      return patch;
    },
    onSuccess: (patch) => {
      if (patch.measurement_system) setSystem(patch.measurement_system);
      return client.invalidateQueries({ queryKey: qk.me(userId) });
    },
  });
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_username_available', { p_username: username });
  if (error) throw error;
  return data === true;
}

/** Uploads a picked image to avatars/<uid>/avatar-<ts>.<ext> and returns its public URL. */
export async function uploadAvatar(userId: string, uri: string, mimeType: string | null | undefined): Promise<string> {
  const type = mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  if (body.byteLength > 2 * 1024 * 1024) throw new Error('That image is larger than 2 MB. Pick a smaller one.');
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: type, upsert: true });
  if (error) throw error;
  const { data: listed } = await supabase.storage.from('avatars').list(userId);
  const stale = (listed ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from('avatars').remove(stale);
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function removeAllAvatars(userId: string) {
  const { data } = await supabase.storage.from('avatars').list(userId);
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) await supabase.storage.from('avatars').remove(paths);
}

export interface ThemeItem {
  id: string;
  name: string;
  description: string;
  tier: string;
  palette: ThemePalette;
  unlockRule: { type: string; threshold_m?: number; level?: number };
  sortOrder: number;
}

export function useThemes() {
  return useQuery({
    queryKey: qk.themes,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<ThemeItem[]> => {
      const rows = unwrap(await supabase.from('themes').select('*').order('sort_order'));
      return rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tier: t.tier,
        palette: parsePalette(t.palette),
        unlockRule: (t.unlock_rule ?? { type: 'reward' }) as ThemeItem['unlockRule'],
        sortOrder: t.sort_order,
      }));
    },
  });
}

export function useUnlockedThemes() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.unlockedThemes(userId),
    enabled: !!userId,
    queryFn: async () => unwrap(await supabase.from('user_unlocked_themes').select('theme_id, unlocked_at, source')),
  });
}

export function useEquipTheme() {
  const { userId } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (themeId: string) => {
      unwrap(await supabase.rpc('equip_theme', { p_theme_id: themeId }));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.me(userId) }),
  });
}

export function useLevels() {
  return useQuery({
    queryKey: qk.levels,
    staleTime: 60 * 60_000,
    queryFn: async () => unwrap(await supabase.from('levels').select('*').order('level')),
  });
}

/** Keeps the locally cached theme and units in sync with the server profile. */
export function useSyncPreferences() {
  const me = useMyProfile();
  const themes = useThemes();
  const applyTheme = usePreferences((s) => s.applyTheme);
  const currentThemeId = usePreferences((s) => s.themeId);
  const setSystem = usePreferences((s) => s.setMeasurementSystem);
  const equipped = me.data?.profile.equipped_theme_id ?? 'trailhead';
  const system = me.data?.settings.measurement_system;
  useEffect(() => {
    const theme = themes.data?.find((t) => t.id === equipped);
    if (theme && theme.id !== currentThemeId) applyTheme(theme.id, theme.palette);
  }, [themes.data, equipped, currentThemeId, applyTheme]);
  useEffect(() => {
    if (system) setSystem(system);
  }, [system, setSystem]);
}

export interface PublicProfile {
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    equipped_theme_id: string | null;
    profile_visibility: 'public' | 'friends' | 'private';
    created_at: string;
  };
  level: { level: number; xp_total: number } | null;
  relationship: 'self' | 'friends' | 'outgoing' | 'incoming' | 'none' | 'blocked';
  can_view_details: boolean;
  stats: {
    activity_count: number;
    total_distance_m: number;
    total_moving_time_s: number;
    daily_streak_days: number;
    daily_streak_last_date: string | null;
    longest_daily_streak: number;
  } | null;
  achievements: { id: string; title: string; icon: string; tier: string; earned_at: string }[] | null;
  shared_challenges: { id: string; title: string; ends_at: string }[];
}

export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: qk.publicProfile(userId),
    queryFn: async () => unwrap(await supabase.rpc('get_public_profile', { p_user_id: userId })) as unknown as PublicProfile,
  });
}
