import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { Button, InlineNotice, Screen, ScreenHeader, TextField, toast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut, updatePassword } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { resetPasswordSchema } from '@/validation/schemas';

type Values = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordScreen() {
  const { spacing } = useAppTheme();
  const { session, setRecovering, expectSignOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await updatePassword(values.password);
      toast.success('Password updated.');
      setRecovering(false);
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader
        title="Choose a new password"
        back={false}
      />
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {!session ? <InlineNotice tone="warning" title="Your reset session expired" message="Request a new reset code to continue." /> : null}
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField label="New password" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} secureToggle autoComplete="new-password" textContentType="newPassword" />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <TextField label="Confirm new password" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} secureToggle autoComplete="new-password" textContentType="newPassword" />
          )}
        />
        <Button label="Save password" size="lg" loading={formState.isSubmitting} disabled={!session} onPress={() => void onSubmit()} fullWidth />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={async () => {
            expectSignOut();
            setRecovering(false);
            await signOut().catch(() => undefined);
            router.replace('/sign-in');
          }}
        />
      </View>
    </Screen>
  );
}
