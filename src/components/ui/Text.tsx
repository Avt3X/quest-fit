import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';

export type TextTone = 'default' | 'muted' | 'subtle' | 'accent' | 'secondary' | 'danger' | 'success' | 'warning' | 'onAccent' | 'onHero' | 'onHeroMuted';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  /** Use tabular digits so changing numbers do not jitter. */
  tabular?: boolean;
  uppercase?: boolean;
}

export function Text({ variant = 'body', tone = 'default', align, tabular, uppercase, style, ...rest }: TextProps) {
  const { colors, type } = useAppTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    accent: colors.accentText,
    secondary: colors.secondaryText,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    onAccent: colors.onAccent,
    onHero: colors.onHero,
    onHeroMuted: colors.onHeroMuted,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        type[variant],
        { color },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        uppercase || variant === 'overline' ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    />
  );
}
