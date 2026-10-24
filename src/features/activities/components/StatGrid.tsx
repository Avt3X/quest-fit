import { View } from 'react-native';

import { Icon, type IconName, Text } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface Stat {
  label: string;
  value: string;
  icon?: IconName;
}

export function StatGrid({ stats, columns = 3, large }: { stats: Stat[]; columns?: 2 | 3 | 4; large?: boolean }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg }}>
      {stats.map((s) => (
        <View key={s.label} style={{ width: `${100 / columns}%`, gap: 2 }} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {s.icon ? <Icon name={s.icon} size={14} /> : null}
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {s.label}
            </Text>
          </View>
          <Text variant={large ? 'metric' : 'heading'} tabular numberOfLines={1} adjustsFontSizeToFit>
            {s.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function StatTile({ label, value, icon, tone = 'surface' }: { label: string; value: string; icon: IconName; tone?: 'surface' | 'accent' }) {
  const { colors, radii, spacing } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        minWidth: 140,
        padding: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: tone === 'accent' ? colors.accentSoft : colors.surfaceMuted,
        gap: spacing.xs,
      }}
    >
      <Icon name={icon} size={18} color={tone === 'accent' ? colors.accentText : colors.textMuted} />
      <Text variant="heading" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
