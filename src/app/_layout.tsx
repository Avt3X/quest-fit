import '@/features/recording/location-service';

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Icon, OverlayHost, Text } from '@/components/ui';
import { AppRuntime } from '@/features/app/AppRuntime';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile } from '@/features/profile/api';
import { env } from '@/lib/env';
import { queryClient, wireQueryLifecycle } from '@/lib/query-client';
import { usePreferences } from '@/state/preferences-store';
import { AppThemeProvider, useAppTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
wireQueryLifecycle();

function RootNavigator() {
  const { colors, scheme } = useAppTheme();
  const { session, initializing, recovering } = useAuth();
  const profile = useMyProfile();
  const onboardedUserId = usePreferences((s) => s.onboardedUserId);
  const setOnboardedUserId = usePreferences((s) => s.setOnboardedUserId);

  const signedIn = !!session && !recovering;
  const serverOnboarded = profile.data ? !!profile.data.profile.onboarding_completed_at : null;
  // Offline cold start: fall back to the last known onboarding state for this user.
  const onboarded = serverOnboarded ?? (session ? onboardedUserId === session.user.id : false);
  const waitingForProfile = signedIn && profile.isPending && onboardedUserId !== session?.user.id;
  const ready = !initializing && !waitingForProfile;

  useEffect(() => {
    if (serverOnboarded && session) setOnboardedUserId(session.user.id);
  }, [serverOnboarded, session, setOnboardedUserId]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!env.isBackendConfigured}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={env.isBackendConfigured && !signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={env.isBackendConfigured && signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={env.isBackendConfigured && signedIn && onboarded}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppThemeProvider>
            <AuthProvider>
              <AppRuntime />
              <RootNavigator />
              <OverlayHost />
            </AuthProvider>
          </AppThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.lg }]}>
      <Icon name="compass-off-outline" size={48} color={colors.accentText} />
      <Text variant="title" align="center">
        We took a wrong turn
      </Text>
      <Text variant="body" tone="muted" align="center">
        QuestFit hit an unexpected error. Your recordings and pending uploads are safe on this device.
      </Text>
      {__DEV__ ? (
        <Text variant="small" tone="subtle" align="center">
          {error.message}
        </Text>
      ) : null}
      <Button label="Try again" icon="refresh" onPress={retry} />
    </View>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <ErrorFallback {...props} />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
