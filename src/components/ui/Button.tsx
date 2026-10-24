import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  haptic?: 'light' | 'medium' | 'none';
}

const HEIGHT: Record<ButtonSize, number> = { sm: 38, md: 48, lg: 58 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  haptic = 'light',
  onPress,
  ...rest
}: ButtonProps) {
  const { colors, radii } = useAppTheme();
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
    secondary: { bg: colors.surfaceMuted, fg: colors.text, border: colors.surfaceMuted },
    outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.accentText, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!isDisabled}
      aria-busy={!!loading}
      disabled={isDisabled}
      onPress={(e) => {
        if (haptic === 'light') haptics.light();
        if (haptic === 'medium') haptics.medium();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: size === 'lg' ? radii.xl : radii.lg,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} color={palette.fg} /> : null}
          <Text variant={size === 'lg' ? 'subheading' : size === 'sm' ? 'smallStrong' : 'bodyStrong'} style={{ color: palette.fg }} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 20} color={palette.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  accessibilityLabel: string;
  size?: number;
  variant?: 'plain' | 'filled' | 'accent';
  color?: string;
  badge?: number;
  style?: ViewStyle;
}

export function IconButton({ icon, size = 22, variant = 'plain', color, badge, style, onPress, ...rest }: IconButtonProps) {
  const { colors } = useAppTheme();
  const bg = variant === 'filled' ? colors.surfaceMuted : variant === 'accent' ? colors.accent : 'transparent';
  const fg = color ?? (variant === 'accent' ? colors.onAccent : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={(e) => {
        haptics.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }, style]}
      {...rest}
    >
      <Icon name={icon} size={size} color={fg} />
      {badge && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
          <Text variant="caption" style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 12 },
});
