import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { colors, spacing, radii } = useAppTheme();
  return (
    <View style={[styles.center, { paddingVertical: compact ? spacing.xl : spacing.huge, gap: spacing.md }]}>
      <View style={{ width: 64, height: 64, borderRadius: radii.xl, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={colors.accentText} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 340 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { paddingVertical: compact ? spacing.lg : spacing.huge, gap: spacing.md }]}>
      <Icon name="cloud-alert" size={36} color={colors.danger} />
      <Text variant="bodyStrong" align="center" accessibilityRole="alert" accessibilityLiveRegion="polite">
        Something went wrong
      </Text>
      <Text variant="small" tone="muted" align="center" style={{ maxWidth: 320 }}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="outline" size="sm" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { paddingVertical: spacing.huge, gap: spacing.md }]} accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? (
        <Text variant="small" tone="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius, style }: { height?: number; width?: ViewStyle['width']; radius?: number; style?: ViewStyle }) {
  const { colors, radii } = useAppTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      aria-hidden
      style={[{ height, width, borderRadius: radius ?? radii.md, backgroundColor: colors.surfaceMuted }, animated, style]}
    />
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  const { colors, spacing, radii } = useAppTheme();
  return (
    <View style={{ padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
      <Skeleton height={20} width="55%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '40%' : '90%'} />
      ))}
    </View>
  );
}

export function InlineNotice({ tone = 'info', icon, title, message, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; title: string; message?: string; action?: React.ReactNode }) {
  const { colors, spacing, radii } = useAppTheme();
  const color = { info: colors.info, warning: colors.warning, danger: colors.danger, success: colors.success }[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : 'summary'}
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: color, backgroundColor: colors.surface }}
    >
      <Icon name={icon ?? (tone === 'success' ? 'check-circle' : tone === 'info' ? 'information' : 'alert-circle')} size={22} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="smallStrong">{title}</Text>
        {message ? (
          <Text variant="small" tone="muted">
            {message}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
