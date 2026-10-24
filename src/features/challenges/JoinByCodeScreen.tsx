import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, InlineNotice, Screen, ScreenHeader, SegmentedControl, TextField } from '@/components/ui';
import { useJoinChallengeByCode } from '@/features/challenges/api';
import { useJoinExpedition } from '@/features/journeys/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Join a private challenge or a group expedition by invite code (also handles questfit://join/CODE). */
export function JoinByCodeScreen() {
  const { spacing } = useAppTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const initial = params.code;
  const [code, setCode] = useState((initial ?? '').toUpperCase());
  const [kind, setKind] = useState<'challenge' | 'expedition'>('challenge');
  const [error, setError] = useState<string | null>(null);
  const joinChallenge = useJoinChallengeByCode();
  const joinExpedition = useJoinExpedition();
  const autoTried = useRef(false);

  const submit = async (value = code) => {
    setError(null);
    const trimmed = value.trim().toUpperCase();
    if (trimmed.length < 6) return setError('Invite codes have 8 characters.');
    try {
      if (kind === 'challenge') {
        const id = await joinChallenge.mutateAsync(trimmed);
        router.replace({ pathname: '/challenge/[id]', params: { id } });
      } else {
        const id = await joinExpedition.mutateAsync({ code: trimmed });
        router.replace({ pathname: '/expedition/[id]', params: { id } });
      }
    } catch (e) {
      // A deep-linked code may belong to an expedition; try that before showing an error.
      if (kind === 'challenge' && autoTried.current === false && initial) {
        autoTried.current = true;
        try {
          const id = await joinExpedition.mutateAsync({ code: trimmed });
          router.replace({ pathname: '/expedition/[id]', params: { id } });
          return;
        } catch {
          // fall through to the original error
        }
      }
      setError(toUserMessage(e));
    }
  };

  useEffect(() => {
    if (initial && !autoTried.current) void submit(initial);
    // Only auto-submit once for deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen keyboard>
      <ScreenHeader title="Join with a code" subtitle="Friends can share codes for private challenges and group expeditions." />
      <View style={{ gap: spacing.lg }}>
        <SegmentedControl
          options={[
            { value: 'challenge', label: 'Challenge', icon: 'flag-outline' },
            { value: 'expedition', label: 'Expedition', icon: 'map-outline' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <TextField label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} autoCapitalize="characters" autoCorrect={false} style={{ fontSize: 22, letterSpacing: 4 }} />
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Button label="Join" size="lg" loading={joinChallenge.isPending || joinExpedition.isPending} onPress={() => void submit()} fullWidth />
      </View>
    </Screen>
  );
}
