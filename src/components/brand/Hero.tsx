import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

import { HeroGradient, ThemePattern } from './ThemePattern';

/** Themed header surface: gradient + pattern from the equipped theme. */
export function Hero({ children, style, rounded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; rounded?: boolean }) {
  const { colors, palette, radii, spacing } = useAppTheme();
  return (
    <View style={[{ borderRadius: rounded ? radii.xxl : 0, overflow: 'hidden', padding: spacing.xl }, style]}>
      <HeroGradient colors={colors.hero} />
      <ThemePattern pattern={palette.pattern} color={colors.accent} secondary={colors.secondary} opacity={0.35} />
      {children}
    </View>
  );
}

/** Original QuestFit mark: a compass needle rising over a mountain path. */
export function LogoMark({ size = 48 }: { size?: number }) {
  const { colors } = useAppTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="QuestFit logo" accessibilityRole="image">
      <Circle cx={32} cy={32} r={30} fill={colors.accent} />
      <Path d="M10 46 L24 28 L32 38 L40 24 L54 46 Z" fill={colors.onAccent} opacity={0.9} />
      <Path d="M32 8 L36 22 L32 19 L28 22 Z" fill={colors.secondary} />
      <Path d="M18 50 C26 44, 34 50, 46 42" stroke={colors.secondary} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
