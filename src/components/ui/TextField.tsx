import { type ComponentRef, forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  suffix?: string;
  secureToggle?: boolean;
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, error, hint, suffix, secureToggle, secureTextEntry, style, multiline, ...rest },
  ref,
) {
  const { colors, radii, spacing } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="smallStrong" tone="muted">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            borderColor,
            borderRadius: radii.lg,
            backgroundColor: colors.surface,
            minHeight: multiline ? 96 : 52,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: colors.text, fontFamily: fonts.body, paddingTop: multiline ? 14 : 0, textAlignVertical: multiline ? 'top' : 'center' },
            style,
          ]}
          {...rest}
        />
        {suffix ? (
          <Text variant="bodyStrong" tone="muted" style={{ marginRight: 14 }}>
            {suffix}
          </Text>
        ) : null}
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            style={{ paddingHorizontal: 14 }}
          >
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { flexDirection: 'row', borderWidth: 1.5 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, minHeight: 48 },
});
