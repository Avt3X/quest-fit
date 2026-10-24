import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { type Vec2, pathUpTo, pointAlongPath } from '@/domain/progress';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

import type { Checkpoint } from './api';
import { JourneyArt, artPalette } from './JourneyArt';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const W = 360;
const H = 300;

function toSvg(path: readonly Vec2[]): string {
  return path.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p[0] * W).toFixed(1)},${(p[1] * H).toFixed(1)}`).join(' ');
}

export interface JourneyMapProps {
  artKey: string;
  path: readonly Vec2[];
  totalM: number;
  progressM: number;
  checkpoints: readonly Checkpoint[];
  unlockedIds: ReadonlySet<string>;
  /** Optional second marker, e.g. the user's personal share inside a group expedition. */
  showLabels?: boolean;
  id: string;
}

export function JourneyMap({ artKey, path, totalM, progressM, checkpoints, unlockedIds, showLabels = true, id }: JourneyMapProps) {
  const { colors, radii } = useAppTheme();
  const art = artPalette(artKey);
  const fraction = totalM > 0 ? Math.min(1, Math.max(0, progressM / totalM)) : 0;
  const marker = pointAlongPath(path, fraction);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  const pulseProps = useAnimatedProps(() => ({ r: 8 + pulse.value * 14, opacity: 0.6 * (1 - pulse.value) }));

  const label = `Journey map. ${Math.round(fraction * 100)} percent complete. ${checkpoints.filter((c) => unlockedIds.has(c.id)).length} of ${checkpoints.length} checkpoints reached.`;

  // Alternate labels above and below the path; drop labels that would still collide, but always
  // keep the start, the finish, the last reached and the next checkpoint.
  const sorted = [...checkpoints].sort((a, b) => Number(a.distance_m) - Number(b.distance_m));
  const lastReached = [...sorted].reverse().find((c) => unlockedIds.has(c.id));
  const nextAhead = sorted.find((c) => !unlockedIds.has(c.id));
  const placed: { x: number; y: number }[] = [];
  const labelled = sorted.map((c, i) => {
    const pt = pointAlongPath(path, totalM > 0 ? Number(c.distance_m) / totalM : 0);
    const x = pt.x * W;
    const y = pt.y * H;
    const below = i % 2 === 1;
    const ly = below ? y + 18 : y - 9;
    const important = i === 0 || i === sorted.length - 1 || c.id === lastReached?.id || c.id === nextAhead?.id;
    const collides = placed.some((p) => Math.abs(p.y - ly) < 14 && Math.abs(p.x - x) < 90);
    const show = important || !collides;
    if (show) placed.push({ x, y: ly });
    return { c, x, y, reached: unlockedIds.has(c.id), label: show, below };
  });

  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ aspectRatio: W / H, width: '100%', borderRadius: radii.xl, overflow: 'hidden', backgroundColor: art.sky[0] }}>
      <JourneyArt artKey={artKey} id={`map-${id}`} />
      <Svg style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <Path d={toSvg(path)} stroke="rgba(0,0,0,0.45)" strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={toSvg(path)} stroke="rgba(255,255,255,0.65)" strokeWidth={3} strokeDasharray="2 8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={toSvg(pathUpTo(path, fraction))} stroke={colors.accent} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {labelled.map(({ c, x, y, reached }) => (
          <Circle key={c.id} cx={x} cy={y} r={reached ? 7 : 6} fill={reached ? colors.secondary : 'rgba(15,20,27,0.85)'} stroke="#FFFFFF" strokeWidth={2} />
        ))}
        <AnimatedCircle cx={marker.x * W} cy={marker.y * H} fill={colors.accent} animatedProps={pulseProps} />
        <Circle cx={marker.x * W} cy={marker.y * H} r={9} fill={colors.accent} stroke="#FFFFFF" strokeWidth={3} />
        {showLabels
          ? labelled
              .filter((l) => l.label)
              .map(({ c, x, y, below }) => {
                const anchorEnd = x > W * 0.7;
                const ly = below ? y + 20 : y - 11;
                const lx = anchorEnd ? x - 10 : x + 10;
                return (
                  <G key={`label-${c.id}`}>
                    <SvgText x={lx} y={ly} fontSize={11} fontFamily={fonts.bodySemi} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={3.5} textAnchor={anchorEnd ? 'end' : 'start'}>
                      {c.name}
                    </SvgText>
                    <SvgText x={lx} y={ly} fontSize={11} fontFamily={fonts.bodySemi} fill="#FFFFFF" textAnchor={anchorEnd ? 'end' : 'start'}>
                      {c.name}
                    </SvgText>
                  </G>
                );
              })
          : null}
      </Svg>
    </View>
  );
}
