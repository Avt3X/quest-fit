import { View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

import type { RouteMapProps } from './RouteMap';
import { RoutePreview } from './RoutePreview';

/** react-native-maps has no web implementation; the web build draws the route with SVG. */
export function RouteMap({ points, height = 240, style, live }: RouteMapProps) {
  const { colors, radii, spacing } = useAppTheme();
  if (points.length < 2) {
    return (
      <View style={[{ height, borderRadius: radii.xl, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, style]}>
        <Icon name="map-marker-radius-outline" size={32} color={colors.textSubtle} />
        <Text variant="small" tone="muted">
          {live ? 'Waiting for GPS…' : 'No route recorded'}
        </Text>
      </View>
    );
  }
  return <RoutePreview points={points} height={height} style={style} showEndpoints={!live} />;
}
