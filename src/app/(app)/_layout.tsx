import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/ThemeProvider';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const { colors } = useAppTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="record/live" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="record/manual" options={{ presentation: 'modal' }} />
      <Stack.Screen name="activity/summary/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="challenge/create" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
