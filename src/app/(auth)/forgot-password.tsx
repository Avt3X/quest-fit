import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, InlineNotice, Screen, ScreenHeader, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { requestPasswordReset, verifyRecoveryCode } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { emailSchema, otpSchema } from '@/validation/schemas';

export default function ForgotPasswordScreen() {
  const { spacing } = useAppTheme();
  const { setRecovering } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const parsed = otpSchema.safeParse({ token: code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    // Keep the user on the reset screen even though verifying creates a session.
    setRecovering(true);
    try {
      await verifyRecoveryCode(email.trim().toLowerCase(), parsed.data.token);
      router.replace('/reset-password');
    } catch (e) {
      setRecovering(false);
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="Reset password" subtitle={sent ? `Enter the code we sent to ${email}.` : 'We will email you a 6-digit reset code.'} />
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        {sent ? (
          <InlineNotice
            tone="success"
            title="Check your email"
            message="If an account exists for this address, a reset code is on its way. It expires in one hour."
          />
        ) : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          editable={!sent}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {sent ? (
          <>
            <TextField
              label="Reset code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              style={{ fontSize: 24, letterSpacing: 8 }}
            />
            <Button label="Continue" size="lg" loading={busy} onPress={verify} fullWidth />
            <Button label="Send a new code" variant="ghost" onPress={send} />
          </>
        ) : (
          <Button label="Send reset code" size="lg" loading={busy} onPress={send} fullWidth />
        )}
      </View>
    </Screen>
  );
}
