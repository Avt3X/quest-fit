import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Button, InlineNotice, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { signUpWithEmail } from '@/features/auth/api';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type SignUpValues, signUpSchema } from '@/validation/schemas';

export default function SignUpScreen() {
  const { spacing } = useAppTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { needsVerification } = await signUpWithEmail({ email: values.email, password: values.password, displayName: values.displayName });
      if (needsVerification) router.replace({ pathname: '/verify', params: { email: values.email } });
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="Create your account" subtitle="It takes less than a minute." />
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <TextField label="Your name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} autoComplete="name" textContentType="name" />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              hint="At least 8 characters with a letter and a number."
              secureToggle
              autoComplete="new-password"
              textContentType="newPassword"
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <TextField
              label="Confirm password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secureToggle
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={() => void onSubmit()}
            />
          )}
        />
        <Button label="Create account" size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()} fullWidth />
        <Text variant="small" tone="subtle" align="center">
          We will email you a 6-digit code to verify your address.
        </Text>
        <SocialButtons />
        <Button label="Already have an account? Sign in" variant="ghost" onPress={() => router.replace('/sign-in')} fullWidth />
      </View>
    </Screen>
  );
}
