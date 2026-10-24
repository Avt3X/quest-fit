import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, InlineNotice, Screen, ScreenHeader, TextField, toast } from '@/components/ui';
import { resendVerification, verifyEmailCode } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { otpSchema } from '@/validation/schemas';

export default function VerifyScreen() {
  const { spacing } = useAppTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(30);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (value = code) => {
    const parsed = otpSchema.safeParse({ token: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(email, parsed.data.token);
      toast.success('Email verified. Welcome to QuestFit!');
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="Check your inbox" subtitle={email ? `We sent a 6-digit code to ${email}.` : 'We sent you a 6-digit code.'} />
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {!email ? <InlineNotice tone="warning" title="Missing email address" message="Go back and sign up or sign in again." /> : null}
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <TextField
          label="Verification code"
          value={code}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) void submit(digits);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 8 }}
        />
        <Button label="Verify email" size="lg" loading={busy} disabled={!email} onPress={() => submit()} fullWidth />
        <Button
          label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          variant="ghost"
          disabled={cooldown > 0 || !email}
          onPress={async () => {
            try {
              await resendVerification(email);
              setCooldown(60);
              toast.success('A new code is on its way.');
            } catch (e) {
              toast.error(toUserMessage(e));
            }
          }}
        />
        <Button label="Use a different email" variant="outline" onPress={() => router.replace('/sign-up')} fullWidth />
      </View>
    </Screen>
  );
}
