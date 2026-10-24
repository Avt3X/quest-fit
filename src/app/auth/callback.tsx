import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorState, LoadingState } from '@/components/ui';
import { completeAuthFromUrl } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Landing route for questfit://auth/callback links (email confirmation, OAuth). */
export default function AuthCallbackScreen() {
  const { colors } = useAppTheme();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    completeAuthFromUrl(url)
      .then(() => router.replace('/'))
      .catch((e: unknown) => setError(toUserMessage(e, 'This link is invalid or has expired.')));
  }, [url]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      {error ? (
        <>
          <ErrorState message={error} />
          <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/')} />
        </>
      ) : (
        <LoadingState label="Signing you in…" />
      )}
    </View>
  );
}
