import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressBarProps {
  value: number;
  height?: number;
  color?: string;
  trackColor?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Optional secondary fill rendered beneath the main fill (e.g. personal share of a group goal). */
  secondaryValue?: number;
  secondaryColor?: string;
}

export function ProgressBar({ value, height = 10, color, trackColor, style, accessibilityLabel, secondaryValue, secondaryColor }: ProgressBarProps) {
  const { colors } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(0);
  const secondary = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [clamped, progress]);
  useEffect(() => {
    secondary.value = withTiming(Math.max(0, Math.min(1, secondaryValue ?? 0)), { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [secondaryValue, secondary]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const secondaryFill = useAnimatedStyle(() => ({ width: `${secondary.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: trackColor ?? colors.track, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[styles.fill, { borderRadius: height / 2, backgroundColor: color ?? colors.accent }, fill]} />
      {secondaryValue !== undefined ? (
        <Animated.View style={[styles.fill, { borderRadius: height / 2, backgroundColor: secondaryColor ?? colors.secondary }, secondaryFill]} />
      ) : null}
    </View>
  );
}

export interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  gradientTo?: string;
  trackColor?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
}

export function ProgressRing({ value, size = 120, stroke = 12, color, gradientTo, trackColor, children, accessibilityLabel }: ProgressRingProps) {
  const { colors } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [clamped, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  const from = color ?? colors.accent;
  const to = gradientTo ?? colors.secondary;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? colors.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ring)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
