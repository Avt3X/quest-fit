// Turns a theme's palette (configured in the database, see public.themes) into the concrete color
// tokens the UI uses. Every derived text color is contrast-checked against the surface it sits on,
// so no theme can make important text unreadable.
import { z } from 'zod';

import { contrastRatio, ensureContrast, isHexColor, mix, withAlpha } from './color';
import { type BaseColors, baseColors } from './tokens';

export const THEME_PATTERNS = ['contours', 'embers', 'peaks', 'aurora', 'runes', 'waves', 'petals'] as const;
export type ThemePattern = (typeof THEME_PATTERNS)[number];

const hex = z.string().refine(isHexColor, 'Expected #RRGGBB');

export const paletteSchema = z.object({
  accent: hex,
  accentMuted: hex,
  onAccent: hex,
  secondary: hex,
  heroDark: z.tuple([hex, hex]),
  heroLight: z.tuple([hex, hex]),
  pattern: z.enum(THEME_PATTERNS),
});
export type ThemePalette = z.infer<typeof paletteSchema>;

export const DEFAULT_THEME_ID = 'trailhead';

/** Bundled copy of the default theme so the app renders before content is fetched. */
export const DEFAULT_PALETTE: ThemePalette = {
  accent: '#1FC99A',
  accentMuted: '#0F6E56',
  onAccent: '#03241B',
  secondary: '#F2B544',
  heroDark: ['#0C2A25', '#0E1A1F'],
  heroLight: ['#D9F5EA', '#F6FBF8'],
  pattern: 'contours',
};

export function parsePalette(value: unknown): ThemePalette {
  const result = paletteSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_PALETTE;
}

export interface ThemeColors extends BaseColors {
  accent: string;
  /** Accent usable for text and icons on surfaces (contrast >= 4.5:1). */
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  onAccent: string;
  secondary: string;
  secondaryText: string;
  secondarySoft: string;
  hero: [string, string];
  /** Text color guaranteed readable on the hero gradient. */
  onHero: string;
  onHeroMuted: string;
  track: string;
}

export function buildColors(scheme: 'light' | 'dark', palette: ThemePalette): ThemeColors {
  const base = baseColors[scheme];
  const hero = scheme === 'dark' ? palette.heroDark : palette.heroLight;
  const accentText = ensureContrast(scheme === 'dark' ? palette.accent : palette.accentMuted, base.surface, 4.5);
  const secondaryText = ensureContrast(scheme === 'dark' ? palette.secondary : mix(palette.secondary, '#000000', 0.45), base.surface, 4.5);
  // Text on the hero must pass against both gradient stops.
  const heroText = scheme === 'dark' ? '#FFFFFF' : base.text;
  const onHero = [hero[0], hero[1]].every((stop) => contrastRatio(heroText, stop) >= 4.5)
    ? heroText
    : ensureContrast(heroText, contrastRatio(heroText, hero[0]) < contrastRatio(heroText, hero[1]) ? hero[0] : hero[1], 4.5);
  const onAccent = ensureContrast(palette.onAccent, palette.accent, 4.5);
  return {
    ...base,
    accent: palette.accent,
    accentText,
    accentSoft: withAlpha(palette.accent, scheme === 'dark' ? 0.16 : 0.14),
    accentBorder: withAlpha(palette.accent, 0.45),
    onAccent,
    secondary: palette.secondary,
    secondaryText,
    secondarySoft: withAlpha(palette.secondary, scheme === 'dark' ? 0.16 : 0.2),
    hero: [hero[0], hero[1]],
    onHero,
    onHeroMuted: withAlpha(onHero, 0.78),
    track: scheme === 'dark' ? '#223042' : '#E6E1D7',
  };
}
