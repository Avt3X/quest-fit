import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { qk } from '@/lib/query-keys';
import { supabase, unwrap } from '@/lib/supabase';

export interface AchievementProgress {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'mythic';
  category: string;
  xp_reward: number;
  reward_theme_id: string | null;
  current_value: number;
  target_value: number;
  rule_type: string;
  earned_at: string | null;
  sort_order: number;
}

export function useAchievementProgress() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.achievements,
    enabled: !!userId,
    queryFn: async (): Promise<AchievementProgress[]> =>
      unwrap(await supabase.rpc('get_achievement_progress')).map((a) => ({
        ...a,
        tier: a.tier as AchievementProgress['tier'],
        current_value: Number(a.current_value),
        target_value: Number(a.target_value),
      })),
  });
}

/** The closest unearned achievement by fraction complete, used for "next milestone" hints. */
export function nextAchievement(list: readonly AchievementProgress[] | undefined): AchievementProgress | null {
  if (!list) return null;
  const candidates = list.filter((a) => !a.earned_at && a.target_value > 0 && a.rule_type !== 'early_activity');
  candidates.sort((a, b) => b.current_value / b.target_value - a.current_value / a.target_value);
  return candidates[0] ?? null;
}

export function useXpHistory() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.xpHistory,
    enabled: !!userId,
    queryFn: async () =>
      unwrap(await supabase.from('experience_transactions').select('*').order('created_at', { ascending: false }).limit(50)),
  });
}

export const TIER_COLORS: Record<AchievementProgress['tier'], string> = {
  bronze: '#C98A5A',
  silver: '#AEB8C4',
  gold: '#F2B544',
  mythic: '#B58CFF',
};
