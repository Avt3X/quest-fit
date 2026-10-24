import { Platform } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  pill: 999,
} as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const typeScale = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.displaySemi, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  smallStrong: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  metric: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  metricLarge: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, letterSpacing: -1.5 },
} as const;

export type TypeVariant = keyof typeof typeScale;

export interface BaseColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  overlay: string;
  tabBar: string;
}

export const baseColors: Record<'light' | 'dark', BaseColors> = {
  dark: {
    background: '#0B0F14',
    surface: '#121821',
    surfaceElevated: '#18202B',
    surfaceMuted: '#1E2733',
    border: '#243040',
    borderStrong: '#33425A',
    text: '#F3F5F7',
    textMuted: '#A9B3C0',
    textSubtle: '#7A8796',
    success: '#3DD68C',
    warning: '#F5B544',
    danger: '#FF6B6E',
    info: '#62A8FF',
    overlay: 'rgba(3, 6, 10, 0.72)',
    tabBar: '#0F141B',
  },
  light: {
    background: '#F6F4EF',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#EFEBE3',
    border: '#E3DED4',
    borderStrong: '#CFC8BA',
    text: '#141A21',
    textMuted: '#4D5866',
    textSubtle: '#6B7583',
    success: '#16834F',
    warning: '#A15C00',
    danger: '#C9373C',
    info: '#1F64D1',
    overlay: 'rgba(20, 26, 33, 0.45)',
    tabBar: '#FFFFFF',
  },
};

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  }),
  floating: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    default: { boxShadow: '0 10px 28px rgba(0,0,0,0.22)' },
  }),
} as const;
