import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Text, toast } from '@/components/ui';
import { env } from '@/lib/env';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from './api';

/** Renders only the providers that are actually configured for this build. */
export function SocialButtons() {
  const { spacing } = useAppTheme();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  useEffect(() => {
    isAppleSignInAvailable().then(setApple, () => setApple(false));
  }, []);
  if (!apple && !env.auth.google) return null;

  const run = async (provider: 'apple' | 'google') => {
    setBusy(provider);
    try {
      await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }}>
        <View style={{ flex: 1, height: 1, opacity: 0.2, backgroundColor: '#888' }} />
        <Text variant="caption" tone="subtle">
          OR
        </Text>
        <View style={{ flex: 1, height: 1, opacity: 0.2, backgroundColor: '#888' }} />
      </View>
      {apple ? <Button label="Continue with Apple" icon="apple" variant="outline" loading={busy === 'apple'} onPress={() => run('apple')} fullWidth /> : null}
      {env.auth.google ? <Button label="Continue with Google" icon="google" variant="outline" loading={busy === 'google'} onPress={() => run('google')} fullWidth /> : null}
    </View>
  );
}
