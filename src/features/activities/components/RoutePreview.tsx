import { memo, useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { type LatLng, projectToBox, toSvgPath } from '@/domain/geo';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Tile-free route drawing. Used for privacy-trimmed previews in feeds and as the web map. */
export const RoutePreview = memo(function RoutePreview({
  points,
  height = 140,
  style,
  showEndpoints = true,
}: {
  points: readonly (LatLng & { segment?: number })[];
  height?: number;
  style?: ViewStyle;
  showEndpoints?: boolean;
}) {
  const { colors, radii } = useAppTheme();
  const width = 320;
  const projected = useMemo(() => projectToBox(points, width, height, 14), [points, height]);
  if (projected.length < 2) return null;
  const d = toSvgPath(projected);
  const first = projected[0];
  const last = projected[projected.length - 1];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Route preview"
      style={[{ height, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, style]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {Array.from({ length: 6 }, (_, i) => (
          <Path key={i} d={`M0,${(i + 1) * (height / 7)} H${width}`} stroke={colors.border} strokeWidth={0.6} />
        ))}
        <Path d={d} stroke={colors.background} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        <Path d={d} stroke={colors.accent} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {showEndpoints ? (
          <>
            <Circle cx={first.x} cy={first.y} r={5} fill={colors.success} stroke="#FFFFFF" strokeWidth={2} />
            <Circle cx={last.x} cy={last.y} r={5} fill={colors.danger} stroke="#FFFFFF" strokeWidth={2} />
          </>
        ) : null}
      </Svg>
    </View>
  );
});
