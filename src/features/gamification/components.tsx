import { router } from 'expo-router';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Button, Card, Icon, ProgressBar, Text, toIconName } from '@/components/ui';
import { levelProgress } from '@/domain/progress';
import { useLevels } from '@/features/profile/api';
import { haptics } from '@/lib/haptics';
import { mix } from '@/theme/color';
import { useAppTheme } from '@/theme/ThemeProvider';

import { type AchievementProgress, TIER_COLORS } from './api';

export function useLevelProgress(xpTotal: number) {
  const levels = useLevels();
  return levelProgress(xpTotal, (levels.data ?? [{ level: 1, xp_required: 0, title: 'Wanderer' }]).map((l) => ({ ...l, xp_required: Number(l.xp_required) })));
}

export function LevelCard({ xpTotal, compact }: { xpTotal: number; compact?: boolean }) {
  const { colors, spacing } = useAppTheme();
  const lp = useLevelProgress(xpTotal);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Level ${lp.level}${lp.title ? `, ${lp.title}` : ''}. ${lp.xpToNext !== null ? `${lp.xpToNext} XP to the next level` : 'Maximum level'}`}
      onPress={() => router.push('/achievements')}
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.secondary }}>
          <Text variant="caption" style={{ color: '#1A1300' }}>
            LV {lp.level}
          </Text>
        </View>
        <Text variant={compact ? 'smallStrong' : 'bodyStrong'} style={{ flex: 1 }} numberOfLines={1}>
          {lp.title ?? 'Adventurer'}
        </Text>
        <Text variant="caption" tone="muted" tabular>
          {lp.xpToNext !== null ? `${lp.xpToNext.toLocaleString('en-US')} XP to go` : 'Max level'}
        </Text>
      </View>
      <ProgressBar value={lp.fraction} height={compact ? 6 : 8} color={colors.secondary} />
    </Pressable>
  );
}

export function AchievementBadge({ achievement, size = 64, showProgress = true }: { achievement: AchievementProgress; size?: number; showProgress?: boolean }) {
  const { colors, spacing } = useAppTheme();
  const earned = !!achievement.earned_at;
  const tier = TIER_COLORS[achievement.tier];
  const fraction = achievement.target_value > 0 ? Math.min(1, achievement.current_value / achievement.target_value) : 0;
  return (
    <View
      accessible
      accessibilityLabel={`${achievement.title}. ${earned ? 'Earned' : `${Math.round(fraction * 100)} percent`}. ${achievement.description}`}
      style={{ alignItems: 'center', gap: spacing.xs, width: size + 28 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: earned ? mix(tier, colors.background, 0.55) : colors.surfaceMuted,
          borderWidth: 3,
          borderColor: earned ? tier : colors.border,
          opacity: earned ? 1 : 0.75,
        }}
      >
        <Icon name={toIconName(achievement.icon, 'trophy-outline')} size={size * 0.46} color={earned ? '#FFFFFF' : colors.textSubtle} />
        {!earned ? (
          <View style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={12} color={colors.textSubtle} />
          </View>
        ) : null}
      </View>
      <Text variant="caption" align="center" numberOfLines={2}>
        {achievement.title}
      </Text>
      {showProgress && !earned ? <ProgressBar value={fraction} height={4} style={{ width: size }} /> : null}
    </View>
  );
}

export function NextMilestoneCard({ achievement, formatValue }: { achievement: AchievementProgress; formatValue: (a: AchievementProgress, v: number) => string }) {
  const { spacing, colors } = useAppTheme();
  const fraction = achievement.target_value > 0 ? Math.min(1, achievement.current_value / achievement.target_value) : 0;
  return (
    <Card onPress={() => router.push('/achievements')} accessibilityLabel={`Next milestone: ${achievement.title}`}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={toIconName(achievement.icon, 'trophy-outline')} size={26} color={colors.secondaryText} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="overline" tone="secondary">
            Next milestone
          </Text>
          <Text variant="bodyStrong">{achievement.title}</Text>
          <ProgressBar value={fraction} height={6} color={colors.secondary} />
          <Text variant="caption" tone="muted" tabular>
            {formatValue(achievement, achievement.current_value)} / {formatValue(achievement, achievement.target_value)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export interface CelebrationItem {
  icon: string;
  title: string;
  subtitle: string;
  color?: string;
}

function Spark({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(index * 18, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [index, progress]);
  const angle = (index / 18) * Math.PI * 2;
  const distance = 90 + (index % 3) * 26;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.5 },
    ],
  }));
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

/** Full-screen celebration for level-ups, achievements, theme unlocks and journey checkpoints. */
export function Celebration({ items, onClose }: { items: CelebrationItem[]; onClose: () => void }) {
  const { colors, spacing, radii } = useAppTheme();
  const visible = items.length > 0;
  useEffect(() => {
    if (visible) haptics.success();
  }, [visible]);
  const hero = items[0];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close celebration">
        {hero ? (
          <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.panel, { backgroundColor: colors.surfaceElevated, borderRadius: radii.xxl, padding: spacing.xxl, gap: spacing.md }]}>
            <View style={styles.burst} pointerEvents="none">
              {Array.from({ length: 18 }, (_, i) => (
                <Spark key={i} index={i} color={i % 2 ? colors.secondary : colors.accent} />
              ))}
            </View>
            <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.color ?? colors.accent, alignSelf: 'center' }}>
              <Icon name={toIconName(hero.icon, 'star-four-points')} size={52} color="#FFFFFF" />
            </View>
            <Text variant="title" align="center">
              {hero.title}
            </Text>
            <Text variant="body" tone="muted" align="center">
              {hero.subtitle}
            </Text>
            {items.slice(1).map((item, i) => (
              <Animated.View key={`${item.title}-${i}`} entering={FadeIn.delay(300 + i * 120)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Icon name={toIconName(item.icon)} size={22} color={item.color ?? colors.accentText} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{item.title}</Text>
                  <Text variant="small" tone="muted">
                    {item.subtitle}
                  </Text>
                </View>
              </Animated.View>
            ))}
            <Button label="Awesome" onPress={onClose} style={{ marginTop: spacing.sm }} fullWidth />
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 420 },
  burst: { position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center' },
  spark: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
});
