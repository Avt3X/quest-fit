import { readFileSync } from 'fs';
import { join } from 'path';

import { contrastRatio, ensureContrast } from '../color';
import { DEFAULT_PALETTE, buildColors, paletteSchema, parsePalette } from '../registry';
import { baseColors } from '../tokens';

/** Extracts every palette JSON literal from the content migration, so real data is tested. */
function migrationPalettes(): { id: string; palette: unknown }[] {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/20261024000006_content.sql'), 'utf8');
  const re = /\('([a-z_]+)', '[^']*(?:''[^']*)*', '[^']*(?:''[^']*)*', '[a-z]+',\s*'(\{[^']+\})'/g;
  const out: { id: string; palette: unknown }[] = [];
  for (let m = re.exec(sql); m; m = re.exec(sql)) out.push({ id: m[1], palette: JSON.parse(m[2]) });
  return out;
}

describe('theme palettes', () => {
  const palettes = migrationPalettes();

  it('finds every configured theme in the content migration', () => {
    expect(palettes.length).toBeGreaterThanOrEqual(12);
    expect(palettes.map((p) => p.id)).toContain('trailhead');
  });

  it.each(palettes.map((p) => [p.id, p.palette] as const))('%s matches the palette schema', (_id, palette) => {
    expect(paletteSchema.safeParse(palette).success).toBe(true);
  });

  it.each(palettes.flatMap((p) => (['light', 'dark'] as const).map((s) => [p.id, s, p.palette] as const)))(
    '%s (%s) keeps text readable',
    (_id, scheme, palette) => {
      const c = buildColors(scheme, parsePalette(palette));
      expect(contrastRatio(c.accentText, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.secondaryText, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onHero, c.hero[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onHero, c.hero[1])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(7);
    },
  );

  it('falls back to the default palette for malformed data', () => {
    expect(parsePalette({ accent: 'red' })).toEqual(DEFAULT_PALETTE);
    expect(parsePalette(null)).toEqual(DEFAULT_PALETTE);
  });

  it('repairs low-contrast colors instead of failing', () => {
    const fixed = ensureContrast('#FFFF66', baseColors.light.surface);
    expect(contrastRatio(fixed, baseColors.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#000000', '#FFFFFF')).toBe('#000000');
  });
});
