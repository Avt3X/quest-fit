import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, InlineNotice, Screen, ScreenHeader, Section, Text, TextField, toast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { requestPasswordReset, signOut } from '@/features/auth/api';
import { removeAllAvatars } from '@/features/profile/api';
import { useUploadQueue } from '@/features/recording/upload-queue';
import { useRecording } from '@/features/recording/recording-store';
import { toUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/state/preferences-store';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AccountScreen() {
  const { spacing } = useAppTheme();
  const { session, expectSignOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const email = session?.user.email ?? '';

  const deleteAccount = async () => {
    if (!session) return;
    setDeleting(true);
    try {
      await removeAllAvatars(session.user.id);
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      for (const item of useUploadQueue.getState().items) await useUploadQueue.getState().remove(item.clientId);
      await useRecording.getState().discard();
      usePreferences.getState().reset();
      expectSignOut();
      await signOut('local').catch(() => undefined);
      toast.success('Your account and data were deleted.');
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen keyboard>
      <ScreenHeader title="Account & data" />
      <Section title="Sign-in">
        <Card style={{ gap: spacing.sm }}>
          <Text variant="small" tone="muted">
            Signed in as
          </Text>
          <Text variant="bodyStrong">{email}</Text>
          <Button
            label="Send password reset code"
            variant="outline"
            size="sm"
            onPress={async () => {
              try {
                await requestPasswordReset(email);
                toast.success('Check your email for a reset code. Sign out and use “Forgot password” to enter it.');
              } catch (e) {
                toast.error(toUserMessage(e));
              }
            }}
          />
        </Card>
      </Section>

      <Section title="What we store">
        <Card style={{ gap: spacing.sm }}>
          <Text variant="small">• Your profile, settings, friends and blocks.</Text>
          <Text variant="small">• Activities with their stats, and GPS routes for recorded activities (visible only to you; shared maps are simplified copies).</Text>
          <Text variant="small">• Challenge participation, journey progress, XP, achievements, themes and notifications.</Text>
          <Text variant="small" tone="muted">
            Unfinished recordings and uploads that have not synced live only on this device.
          </Text>
        </Card>
      </Section>

      <Section title="Delete account">
        <InlineNotice
          tone="danger"
          title="This permanently deletes everything"
          message="Your profile, activities, routes, photos, achievements, XP, friendships and notifications are deleted. Your contributions are removed from challenges and group journeys. This cannot be undone."
        />
        <TextField label='Type "DELETE" to confirm' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
        <View>
          <Button label="Delete my account" variant="danger" icon="delete-forever" loading={deleting} disabled={confirmText.trim() !== 'DELETE'} onPress={() => void deleteAccount()} fullWidth />
        </View>
      </Section>
    </Screen>
  );
}
