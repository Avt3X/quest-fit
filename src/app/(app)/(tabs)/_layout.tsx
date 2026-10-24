import { router } from 'expo-router';
import { type BottomTabBarProps, Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon, type IconName, Text } from '@/components/ui';
import { useRecording } from '@/features/recording/recording-store';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  home: { label: 'Home', icon: 'home-variant-outline', iconActive: 'home-variant' },
  explore: { label: 'Explore', icon: 'compass-outline', iconActive: 'compass' },
  record: { label: 'Record', icon: 'record-circle-outline', iconActive: 'record-circle' },
  challenges: { label: 'Challenges', icon: 'flag-outline', iconActive: 'flag' },
  profile: { label: 'Profile', icon: 'account-circle-outline', iconActive: 'account-circle' },
};

function RecordButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const { colors, shadows } = useAppTheme();
  const recording = useRecording((s) => s.session !== null && s.session.status !== 'finished');
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = recording ? withRepeat(withTiming(1.12, { duration: 700 }), -1, true) : withTiming(1);
  }, [recording, pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Return to the activity being recorded' : 'Record an activity'}
      accessibilityState={{ selected: focused }}
      onPress={() => {
        haptics.medium();
        onPress();
      }}
      style={styles.recordWrap}
    >
      <Animated.View style={[styles.recordButton, shadows.floating, { backgroundColor: recording ? colors.danger : colors.accent, borderColor: colors.tabBar }, ring]}>
        <Icon name={recording ? 'record-rec' : 'plus'} size={30} color={recording ? '#FFFFFF' : colors.onAccent} />
      </Animated.View>
      <Text variant="caption" style={{ color: recording ? colors.danger : focused ? colors.accentText : colors.textMuted, marginTop: 2 }}>
        {recording ? 'Recording' : 'Record'}
      </Text>
    </Pressable>
  );
}

function QuestTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { colors } = useAppTheme();
  const hasSession = useRecording((s) => s.session !== null);
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.tabBar, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        if (route.name === 'record') {
          return (
            <RecordButton
              key={route.key}
              focused={focused}
              onPress={() => (hasSession ? router.push('/record/live') : navigateToTab(route.key))}
            />
          );
        }
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              if (!focused) haptics.tap();
              navigateToTab(route.key);
            }}
            style={styles.tab}
          >
            <Icon name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? colors.accentText : colors.textMuted} />
            <Text variant="caption" style={{ color: focused ? colors.accentText : colors.textMuted }} numberOfLines={1}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'home' };

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <QuestTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="challenges" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  recordWrap: { flex: 1, alignItems: 'center', marginTop: -26 },
  recordButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
});
