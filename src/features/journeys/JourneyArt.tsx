// Original, procedurally drawn journey artwork keyed by journeys.art_key. No third-party or
// franchise imagery is used; new journeys can reuse any art key without an app release.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

export interface ArtPalette {
  sky: [string, string];
  far: string;
  mid: string;
  near: string;
  accent: string;
  glow: string;
}

export const ART_PALETTES: Record<string, ArtPalette> = {
  ashen: { sky: ['#2B0F1A', '#5C1E1E'], far: '#3B1A22', mid: '#2A1218', near: '#170A0E', accent: '#FF6A3D', glow: '#FFB15C' },
  alps: { sky: ['#1B2C4A', '#E58FA0'], far: '#8FA4C4', mid: '#4B5E80', near: '#26324A', accent: '#FFFFFF', glow: '#FFD0D8' },
  japan: { sky: ['#F9C8D6', '#FFE9D6'], far: '#B9A6C9', mid: '#6E5A8A', near: '#3D2F52', accent: '#E8445A', glow: '#FFFFFF' },
  georgia: { sky: ['#14324A', '#F2A65A'], far: '#5E7C6B', mid: '#3C5A4A', near: '#1E3228', accent: '#B8324B', glow: '#FFE3A3' },
  coast: { sky: ['#0E3B52', '#7FD6E6'], far: '#2C7A8C', mid: '#1B5566', near: '#0C3442', accent: '#F7D488', glow: '#FFFFFF' },
  lantern: { sky: ['#0D1033', '#2A2F6E'], far: '#1E2457', mid: '#151A45', near: '#0A0D2A', accent: '#FFB347', glow: '#FFE1A8' },
};

export function artPalette(key: string): ArtPalette {
  return ART_PALETTES[key] ?? ART_PALETTES.ashen;
}

const W = 400;
const H = 240;

function ridge(baseY: number, amp: number, seed: number, step = 40): string {
  let d = `M0,${H} L0,${baseY}`;
  let s = seed;
  for (let x = 0; x <= W; x += step) {
    s = (s * 9301 + 49297) % 233280;
    const peak = baseY - amp * (0.35 + (s / 233280) * 0.65);
    d += ` L${x + step / 2},${peak.toFixed(1)} L${x + step},${(baseY - (s % 13)).toFixed(1)}`;
  }
  return `${d} L${W},${H} Z`;
}

function Feature({ artKey, p }: { artKey: string; p: ArtPalette }) {
  switch (artKey) {
    case 'ashen':
      return (
        <G>
          <Path d="M150,240 L230,70 L250,82 L270,64 L350,240 Z" fill={p.mid} />
          <Path d="M230,70 L250,82 L270,64 L262,92 L240,96 Z" fill={p.accent} opacity={0.85} />
          <Circle cx={252} cy={52} r={22} fill={p.glow} opacity={0.25} />
          <Path d="M246,50 C240,30 262,26 256,8" stroke={p.glow} strokeWidth={4} opacity={0.4} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'alps':
      return (
        <G>
          <Path d="M190,240 L262,58 L292,120 L310,96 L380,240 Z" fill={p.mid} />
          <Path d="M262,58 L282,104 L268,98 L256,112 L246,98 Z" fill={p.accent} />
        </G>
      );
    case 'japan':
      return (
        <G>
          <Circle cx={300} cy={70} r={30} fill={p.accent} opacity={0.9} />
          <Path d="M90,240 L200,96 L310,240 Z" fill={p.far} />
          <Path d="M200,96 L222,124 L210,120 L200,130 L190,120 L178,124 Z" fill={p.glow} />
          <Rect x={40} y={150} width={60} height={6} rx={2} fill={p.accent} />
          <Rect x={46} y={160} width={48} height={4} fill={p.accent} />
          <Rect x={52} y={156} width={5} height={60} fill={p.accent} />
          <Rect x={83} y={156} width={5} height={60} fill={p.accent} />
        </G>
      );
    case 'georgia':
      return (
        <G>
          <Path d="M200,240 L290,60 L380,240 Z" fill={p.far} />
          <Path d="M290,60 L312,104 L296,98 L284,110 L270,100 Z" fill={p.glow} opacity={0.9} />
          <Rect x={120} y={150} width={26} height={30} fill={p.near} />
          <Polygon points="118,150 133,132 148,150" fill={p.near} />
          <Rect x={130} y={122} width={6} height={12} fill={p.near} />
          <Polygon points="128,122 133,114 138,122" fill={p.near} />
        </G>
      );
    case 'coast':
      return (
        <G>
          <Rect x={300} y={96} width={14} height={70} fill={p.glow} />
          <Rect x={300} y={110} width={14} height={8} fill={p.accent} />
          <Rect x={300} y={132} width={14} height={8} fill={p.accent} />
          <Polygon points="296,96 307,82 318,96" fill={p.accent} />
          <Path d="M307,88 L380,70 L380,106 Z" fill={p.accent} opacity={0.25} />
        </G>
      );
    case 'lantern':
      return (
        <G>
          {[60, 130, 210, 280, 340].map((x, i) => (
            <G key={x}>
              <Rect x={x} y={40 + (i % 3) * 22} width={12} height={16} rx={4} fill={p.accent} opacity={0.9} />
              <Circle cx={x + 6} cy={48 + (i % 3) * 22} r={14} fill={p.glow} opacity={0.18} />
            </G>
          ))}
          <Path d="M250,190 L290,120 L330,190 Z" fill={p.mid} />
          <Rect x={286} y={104} width={8} height={18} fill={p.accent} />
        </G>
      );
    default:
      return null;
  }
}

export const JourneyArt = memo(function JourneyArt({ artKey, id }: { artKey: string; id: string }) {
  const p = artPalette(artKey);
  const isWater = artKey === 'coast' || artKey === 'lantern';
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} aria-hidden pointerEvents="none">
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.sky[0]} />
          <Stop offset="1" stopColor={p.sky[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#sky-${id})`} />
      <Path d={ridge(150, 60, 17)} fill={p.far} opacity={0.7} />
      <Feature artKey={artKey} p={p} />
      {isWater ? (
        <G>
          <Rect x={0} y={180} width={W} height={60} fill={p.near} />
          {[188, 200, 214, 228].map((y, i) => (
            <Path key={y} d={`M0,${y} Q50,${y - 5} 100,${y} T200,${y} T300,${y} T400,${y}`} stroke={p.glow} strokeWidth={1.2} opacity={0.3 - i * 0.05} fill="none" />
          ))}
        </G>
      ) : (
        <G>
          <Path d={ridge(196, 50, 41, 34)} fill={p.mid} />
          <Path d={ridge(232, 30, 73, 26)} fill={p.near} />
        </G>
      )}
    </Svg>
    </View>
  );
});
