import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Hero } from '@/components/brand/Hero';
import { Button, Card, Chip, ErrorState, Icon, LoadingState, ProgressBar, Screen, ScreenHeader, Text, toast } from '@/components/ui';
import { useMyProfile, useEquipTheme, useThemes, useUnlockedThemes } from '@/features/profile/api';
import { useUnits } from '@/hooks/useUnits';
import { haptics } from '@/lib/haptics';
import { toUserMessage } from '@/lib/errors';
import { usePreferences } from '@/state/preferences-store';
import { ThemePreviewProvider, useAppTheme } from '@/theme/ThemeProvider';

const TIER_LABEL: Record<string, string> = { standard: 'Standard', rare: 'Rare', epic: 'Epic', mythic: 'Mythic' };

function PreviewCard({ name }: { name: string }) {
  const { spacing, colors } = useAppTheme();
  return (
    <Hero style={{ gap: spacing.sm }}>
      <Text variant="overline" tone="onHeroMuted">
        Preview
      </Text>
      <Text variant="title" tone="onHero">
        {name}
      </Text>
      <ProgressBar value={0.62} height={8} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent }}>
          <Text variant="caption" style={{ color: colors.onAccent }}>
            Record
          </Text>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.secondary }}>
          <Text variant="caption" style={{ color: '#1A1300' }}>
            LV 12
          </Text>
        </View>
      </View>
    </Hero>
  );
}

export default function ThemesScreen() {
  const { spacing, colors, radii } = useAppTheme();
  const units = useUnits();
  const themes = useThemes();
  const unlocked = useUnlockedThemes();
  const me = useMyProfile();
  const equip = useEquipTheme();
  const applyTheme = usePreferences((s) => s.applyTheme);
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (themes.isPending || unlocked.isPending) return <LoadingState />;
  if (themes.isError) return <ErrorState message="Could not load themes." onRetry={() => void themes.refetch()} />;

  const unlockedIds = new Set((unlocked.data ?? []).map((u) => u.theme_id));
  const equippedId = me.data?.profile.equipped_theme_id ?? 'trailhead';
  const preview = themes.data?.find((t) => t.id === (previewId ?? equippedId)) ?? themes.data?.[0];
  const totalDistance = Number(me.data?.stats.total_distance_m ?? 0);
  const level = me.data?.xp.level ?? 1;

  const requirement = (rule: { type: string; threshold_m?: number; level?: number }) => {
    if (rule.type === 'default') return 'Unlocked for everyone';
    if (rule.type === 'total_distance' && rule.threshold_m) return `Travel ${units.distance(rule.threshold_m, 0)} in total`;
    if (rule.type === 'level' && rule.level) return `Reach level ${rule.level}`;
    return 'Earned by completing a journey or challenge';
  };
  const progress = (rule: { type: string; threshold_m?: number; level?: number }) => {
    if (rule.type === 'total_distance' && rule.threshold_m) return Math.min(1, totalDistance / rule.threshold_m);
    if (rule.type === 'level' && rule.level) return Math.min(1, level / rule.level);
    return null;
  };

  return (
    <Screen>
      <ScreenHeader title="Themes" subtitle="Your milestones unlock new looks. Text always stays readable, whatever you pick." />
      {preview ? (
        <ThemePreviewProvider palette={preview.palette}>
          <PreviewCard name={preview.name} />
        </ThemePreviewProvider>
      ) : null}

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {(themes.data ?? []).map((t) => {
          const isUnlocked = unlockedIds.has(t.id);
          const isEquipped = t.id === equippedId;
          const p = progress(t.unlockRule);
          return (
            <Card key={t.id} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderColor: previewId === t.id ? colors.accent : colors.border, borderWidth: previewId === t.id ? 2 : 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t.name}. ${isUnlocked ? (isEquipped ? 'Equipped' : 'Unlocked') : `Locked. ${requirement(t.unlockRule)}`}. Tap to preview.`}
                onPress={() => {
                  haptics.tap();
                  setPreviewId(t.id);
                }}
                style={{ flex: 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
              >
                <View style={{ width: 56, height: 56, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: t.palette.heroDark[0], alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.palette.accent }} />
                  <View style={{ position: 'absolute', right: 8, bottom: 8, width: 12, height: 12, borderRadius: 6, backgroundColor: t.palette.secondary }} />
                  {!isUnlocked ? (
                    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="lock" size={18} color="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="bodyStrong">{t.name}</Text>
                    <Chip label={TIER_LABEL[t.tier] ?? t.tier} size="sm" tone={t.tier === 'mythic' || t.tier === 'epic' ? 'secondary' : 'default'} />
                  </View>
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {isUnlocked ? t.description : requirement(t.unlockRule)}
                  </Text>
                  {!isUnlocked && p !== null ? <ProgressBar value={p} height={4} style={{ marginTop: 4 }} /> : null}
                </View>
              </Pressable>
                {isEquipped ? (
                  <Chip label="Equipped" icon="check" size="sm" tone="accent" />
                ) : isUnlocked ? (
                  <Button
                    label="Equip"
                    size="sm"
                    loading={equip.isPending && equip.variables === t.id}
                    onPress={() =>
                      equip.mutate(t.id, {
                        onSuccess: () => {
                          applyTheme(t.id, t.palette);
                          toast.success(`${t.name} equipped`);
                        },
                        onError: (e) => toast.error(toUserMessage(e)),
                      })
                    }
                  />
                ) : null}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
