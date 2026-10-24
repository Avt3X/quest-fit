import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences } from '@/state/preferences-store';

import { type ThemeColors, type ThemePalette, buildColors, parsePalette } from './registry';
import { radii, shadows, spacing, typeScale } from './tokens';

export interface AppTheme {
  scheme: 'light' | 'dark';
  themeId: string;
  palette: ThemePalette;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof typeScale;
  shadows: typeof shadows;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function useResolvedScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const appearance = usePreferences((s) => s.appearance);
  if (appearance === 'system') return system === 'light' ? 'light' : 'dark';
  return appearance;
}

export function buildTheme(scheme: 'light' | 'dark', themeId: string, palette: ThemePalette): AppTheme {
  return { scheme, themeId, palette, colors: buildColors(scheme, palette), spacing, radii, type: typeScale, shadows };
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme();
  const themeId = usePreferences((s) => s.themeId);
  const storedPalette = usePreferences((s) => s.palette);
  const theme = useMemo(() => buildTheme(scheme, themeId, parsePalette(storedPalette)), [scheme, themeId, storedPalette]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    };
  }, [scheme, theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return theme;
}

/** Previews another palette (theme gallery) without equipping it. */
export function ThemePreviewProvider({ palette, children }: { palette: ThemePalette; children: ReactNode }) {
  const parent = useAppTheme();
  const theme = useMemo(() => buildTheme(parent.scheme, parent.themeId, palette), [parent.scheme, parent.themeId, palette]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
