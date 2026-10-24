import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Avatar, Icon, Text, toast } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

import { uploadAvatar } from './api';

export function AvatarPicker({ userId, name, uri, onUploaded }: { userId: string; name: string; uri: string | null; onUploaded: (url: string) => void }) {
  const { colors, spacing } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const url = await uploadAvatar(userId, result.assets[0].uri, result.assets[0].mimeType);
      onUploaded(url);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Choose a profile picture" onPress={pick} style={{ alignItems: 'center', gap: spacing.sm }}>
      <View>
        <Avatar name={name || '?'} uri={uri} size={96} ring={colors.accent} />
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Icon name="camera" size={18} color={colors.onAccent} />}
        </View>
      </View>
      <Text variant="small" tone="accent">
        {uri ? 'Change photo' : 'Add a photo (optional)'}
      </Text>
    </Pressable>
  );
}
