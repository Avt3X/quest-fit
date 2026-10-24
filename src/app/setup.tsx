import { View } from 'react-native';

import { LogoMark } from '@/components/brand/Hero';
import { Card, InlineNotice, Screen, Text } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

const STEPS = [
  'Install the Supabase CLI and Docker, then run `npm run db:start` in the project folder.',
  'Copy `.env.example` to `.env.local` and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from the output.',
  'Restart the dev server with `npx expo start -c` so the new values are bundled.',
];

/** Shown instead of the app when no backend is configured. No demo data is substituted. */
export default function SetupScreen() {
  const { spacing } = useAppTheme();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.huge }}>
        <LogoMark size={72} />
        <Text variant="display" align="center">
          Connect a backend
        </Text>
        <Text variant="body" tone="muted" align="center">
          QuestFit stores activities, challenges and progress in Supabase. This build has no Supabase project configured, so nothing can be saved yet.
        </Text>
      </View>
      <Card style={{ marginTop: spacing.xxl, gap: spacing.md }}>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flexDirection: 'row', gap: spacing.md }}>
            <Text variant="heading" tone="accent">
              {i + 1}
            </Text>
            <Text variant="body" style={{ flex: 1 }}>
              {step}
            </Text>
          </View>
        ))}
      </Card>
      <View style={{ marginTop: spacing.lg }}>
        <InlineNotice tone="info" title="Full instructions" message="See docs/SETUP.md for local and hosted Supabase setup, auth providers and native builds." />
      </View>
    </Screen>
  );
}
