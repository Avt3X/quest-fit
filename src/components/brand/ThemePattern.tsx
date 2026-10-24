// Decorative, original vector patterns that express the equipped theme. They sit behind hero
// content at low opacity and never carry information, so they are hidden from screen readers.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { ThemePattern as PatternName } from '@/theme/registry';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const W = 400;
const H = 260;

function contours(color: string) {
  const paths: string[] = [];
  for (let k = 0; k < 9; k += 1) {
    const r = 30 + k * 26;
    let d = '';
    for (let a = 0; a <= 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      const wobble = 1 + 0.08 * Math.sin(rad * 3 + k) + 0.05 * Math.cos(rad * 5 - k);
      const x = 300 + Math.cos(rad) * r * wobble * 1.3;
      const y = 70 + Math.sin(rad) * r * wobble;
      d += `${a === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    paths.push(`${d}Z`);
  }
  return paths.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={1.2} fill="none" opacity={0.9 - i * 0.07} />);
}

function embers(color: string, secondary: string) {
  const r = rng(7);
  return Array.from({ length: 46 }, (_, i) => (
    <Circle key={i} cx={r() * W} cy={r() * H} r={0.8 + r() * 2.8} fill={i % 3 === 0 ? secondary : color} opacity={0.25 + r() * 0.6} />
  ));
}

function peaks(color: string) {
  const ranges = [
    { y: 200, amp: 90, step: 46, o: 0.35 },
    { y: 225, amp: 70, step: 34, o: 0.55 },
    { y: 250, amp: 50, step: 26, o: 0.8 },
  ];
  const r = rng(3);
  return ranges.map((rg, idx) => {
    let d = `M0,${H} L0,${rg.y}`;
    for (let x = 0; x <= W + rg.step; x += rg.step) {
      d += ` L${x + rg.step / 2},${rg.y - rg.amp * (0.4 + r() * 0.6)} L${x + rg.step},${rg.y - r() * 10}`;
    }
    d += ` L${W},${H} Z`;
    return <Path key={idx} d={d} fill={color} opacity={rg.o * 0.5} />;
  });
}

function aurora(color: string, secondary: string) {
  return [0, 1, 2, 3].map((i) => {
    const y = 40 + i * 34;
    const d = `M-20,${y} C80,${y - 50} 160,${y + 60} 240,${y} S380,${y - 40} 430,${y + 10}`;
    return <Path key={i} d={d} stroke={i % 2 ? secondary : color} strokeWidth={14 - i * 2} strokeLinecap="round" fill="none" opacity={0.35 - i * 0.05} />;
  });
}

function runes(color: string) {
  const r = rng(11);
  return Array.from({ length: 18 }, (_, i) => {
    const x = 20 + (i % 6) * 66 + r() * 12;
    const y = 30 + Math.floor(i / 6) * 80 + r() * 12;
    const s = 10 + r() * 8;
    const d = `M${x},${y - s} L${x + s * 0.7},${y} L${x},${y + s} L${x - s * 0.7},${y} Z M${x},${y - s * 1.4} L${x},${y + s * 1.4}`;
    return <Path key={i} d={d} stroke={color} strokeWidth={1.2} fill="none" opacity={0.25 + r() * 0.45} />;
  });
}

function waves(color: string) {
  return Array.from({ length: 8 }, (_, i) => {
    const y = 40 + i * 28;
    let d = `M0,${y}`;
    for (let x = 0; x <= W; x += 20) d += ` Q${x + 10},${y + (i % 2 ? 8 : -8)} ${x + 20},${y}`;
    return <Path key={i} d={d} stroke={color} strokeWidth={1.4} fill="none" opacity={0.25 + i * 0.07} />;
  });
}

function petals(color: string, secondary: string) {
  const r = rng(5);
  return Array.from({ length: 30 }, (_, i) => {
    const cx = r() * W;
    const cy = r() * H;
    return (
      <Ellipse
        key={i}
        cx={cx}
        cy={cy}
        rx={3 + r() * 5}
        ry={1.6 + r() * 2.4}
        fill={i % 4 === 0 ? secondary : color}
        opacity={0.3 + r() * 0.5}
        transform={`rotate(${Math.round(r() * 180)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
      />
    );
  });
}

export const ThemePattern = memo(function ThemePattern({ pattern, color, secondary, opacity = 0.5 }: { pattern: PatternName; color: string; secondary: string; opacity?: number }) {
  const content = {
    contours: () => contours(color),
    embers: () => embers(color, secondary),
    peaks: () => peaks(color),
    aurora: () => aurora(color, secondary),
    runes: () => runes(color),
    waves: () => waves(color),
    petals: () => petals(color, secondary),
  }[pattern]();
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} aria-hidden pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <G opacity={opacity}>{content}</G>
      </Svg>
    </View>
  );
});

export function HeroGradient({ colors, id = 'hero' }: { colors: [string, string]; id?: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} aria-hidden pointerEvents="none">
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
    </View>
  );
}
