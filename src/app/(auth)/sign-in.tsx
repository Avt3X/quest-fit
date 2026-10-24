import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Button, InlineNotice, Screen, ScreenHeader, TextField } from '@/components/ui';
import { signInWithEmail } from '@/features/auth/api';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type SignInValues, signInSchema } from '@/validation/schemas';

export default function SignInScreen() {
  const { spacing } = useAppTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signInWithEmail(values.email, values.password);
    } catch (e) {
      const message = toUserMessage(e);
      if (message.startsWith('Please verify your email')) {
        router.push({ pathname: '/verify', params: { email: values.email } });
        return;
      }
      setError(message);
    }
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="Welcome back" subtitle="Sign in to continue your quest." />
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {error ? <InlineNotice tone="danger" title={error} /> : null}
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
              returnKeyType="next"
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
              secureToggle
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
          )}
        />
        <Button label="Sign in" size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()} fullWidth />
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={() => router.push({ pathname: '/forgot-password', params: { email: getValues('email') } })}
        />
        <SocialButtons />
        <Button label="New here? Create an account" variant="outline" onPress={() => router.replace('/sign-up')} fullWidth />
      </View>
    </Screen>
  );
}
