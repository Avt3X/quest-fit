import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface Bar {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
  /** Accessible description, e.g. "Monday: 5.2 km". */
  description: string;
}

export function BarChart({ bars, height = 96 }: { bars: Bar[]; height?: number }) {
  const { colors, radii, spacing } = useAppTheme();
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: height + 22 }}>
      {bars.map((b, i) => {
        const h = b.value > 0 ? Math.max(6, (b.value / max) * height) : 4;
        return (
          <View key={b.key} accessible accessibilityLabel={b.description} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Animated.View
              entering={FadeInUp.delay(i * 40).duration(380)}
              style={{
                width: '70%',
                maxWidth: 28,
                height: h,
                borderRadius: radii.sm,
                backgroundColor: b.value > 0 ? (b.highlight ? colors.secondary : colors.accent) : colors.track,
              }}
            />
            <Text variant="caption" tone={b.highlight ? 'default' : 'subtle'}>
              {b.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
