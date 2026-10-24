import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress?: () => void;
  tone?: 'default' | 'accent' | 'secondary';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Chip({ label, selected, icon, onPress, tone = 'default', size = 'md', style }: ChipProps) {
  const { colors, radii } = useAppTheme();
  const active = selected || tone !== 'default';
  const bg = selected ? colors.accent : tone === 'accent' ? colors.accentSoft : tone === 'secondary' ? colors.secondarySoft : colors.surfaceMuted;
  const fg = selected ? colors.onAccent : tone === 'accent' ? colors.accentText : tone === 'secondary' ? colors.secondaryText : colors.text;
  const content = (
    <>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} color={fg} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'smallStrong'} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  const base: ViewStyle = {
    ...styles.chip,
    borderRadius: radii.pill,
    backgroundColor: bg,
    paddingVertical: size === 'sm' ? 4 : 8,
    paddingHorizontal: size === 'sm' ? 10 : 14,
    borderWidth: active ? 0 : 1,
    borderColor: colors.border,
  };
  if (!onPress) return <View style={[base, style]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={!!selected}
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [base, { opacity: pressed ? 0.8 : 1 }, style]}
    >
      {content}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const { colors, radii } = useAppTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.segmented, { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            aria-selected={selected}
            accessibilityLabel={o.label}
            onPress={() => {
              if (!selected) haptics.tap();
              onChange(o.value);
            }}
            style={[styles.segment, { borderRadius: radii.md, backgroundColor: selected ? colors.surface : 'transparent' }]}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={selected ? colors.accentText : colors.textMuted} /> : null}
            <Text variant="smallStrong" style={{ color: selected ? colors.text : colors.textMuted }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  row: { gap: 8, paddingVertical: 2 },
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
});
