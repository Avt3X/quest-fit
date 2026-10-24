import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/ThemeProvider';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  const { colors } = useAppTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
