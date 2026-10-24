import type { ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  tone?: 'surface' | 'muted' | 'accent' | 'outline';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Card({ children, onPress, padded = true, tone = 'surface', style, accessibilityLabel, accessibilityHint, testID }: CardProps) {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const toneStyle: ViewStyle = {
    surface: { backgroundColor: colors.surface, borderColor: colors.border },
    muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
    accent: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
    outline: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  }[tone];
  const base: ViewStyle = {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: padded ? spacing.lg : 0,
    overflow: 'hidden',
    ...toneStyle,
  };
  if (!onPress) {
    return (
      <View testID={testID} style={[base, tone === 'surface' ? shadows.card : null, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [base, tone === 'surface' ? shadows.card : null, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}
