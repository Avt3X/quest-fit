import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
}

export function ListRow({ title, subtitle, icon, iconColor, left, right, onPress, chevron = !!onPress, destructive, accessibilityHint }: ListRowProps) {
  const { colors, spacing, radii } = useAppTheme();
  const content = (
    <View style={[styles.row, { paddingVertical: spacing.md, gap: spacing.md }]}>
      {left ??
        (icon ? (
          <View style={[styles.iconWrap, { backgroundColor: destructive ? colors.surfaceMuted : colors.accentSoft, borderRadius: radii.md }]}>
            <Icon name={icon} size={20} color={destructive ? colors.danger : iconColor ?? colors.accentText} />
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={22} color={colors.textSubtle} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function SwitchRow({ title, subtitle, value, onValueChange, icon, disabled }: { title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; icon?: IconName; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      chevron={false}
      right={
        <Switch
          accessibilityLabel={title}
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            haptics.tap();
            onValueChange(v);
          }}
          trackColor={{ true: colors.accent, false: colors.borderStrong }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}

export function Divider() {
  const { colors } = useAppTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
