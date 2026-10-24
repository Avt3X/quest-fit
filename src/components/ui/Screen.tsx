import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeProvider';

import { IconButton } from './Button';
import { Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  footer?: ReactNode;
  testID?: string;
}

/** Max content width keeps layouts readable on tablets and wide web windows. */
export const MAX_CONTENT_WIDTH = 720;

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  refreshing,
  onRefresh,
  contentStyle,
  keyboard,
  footer,
  testID,
}: ScreenProps) {
  const { colors, spacing } = useAppTheme();
  const inner: ViewStyle = {
    paddingHorizontal: padded ? spacing.lg : 0,
    paddingBottom: spacing.huge,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  };
  const body = scroll ? (
    <ScrollView
      testID={testID}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[inner, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View testID={testID} style={[{ flex: 1 }, inner, contentStyle]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </SafeAreaView>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  large?: boolean;
}

export function ScreenHeader({ title, subtitle, back = true, right, large }: ScreenHeaderProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.header, { paddingVertical: spacing.sm, marginBottom: spacing.sm }]}>
      {back ? (
        <IconButton
          icon="arrow-left"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ marginLeft: -8 }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant={large ? 'display' : 'title'} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[{ marginTop: spacing.xxl, gap: spacing.md }, style]}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
