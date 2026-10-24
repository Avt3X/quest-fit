import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, InlineNotice, LoadingState, Screen, ScreenHeader, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from '@/domain/activity-types';
import { useUserId } from '@/features/auth/AuthProvider';
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import { type MyProfile, isUsernameAvailable, useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { profileSchema } from '@/validation/schemas';

export default function EditProfileScreen() {
  const me = useMyProfile();
  if (!me.data) return <LoadingState />;
  return <EditProfileForm profile={me.data.profile} />;
}

function EditProfileForm({ profile: p }: { profile: MyProfile['profile'] }) {
  const { spacing } = useAppTheme();
  const userId = useUserId();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(p.display_name);
  const [username, setUsername] = useState(p.username);
  const [bio, setBio] = useState(p.bio ?? '');
  const [goal, setGoal] = useState(p.fitness_goal ?? '');
  const [avatar, setAvatar] = useState<string | null>(p.avatar_url);
  const [types, setTypes] = useState<ActivityType[]>(p.preferred_activity_types);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const parsed = profileSchema.safeParse({ displayName, username, bio, fitnessGoal: goal });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your details.');
    if (parsed.data.username !== p.username && !(await isUsernameAvailable(parsed.data.username).catch(() => true))) {
      return setError('That username is already taken.');
    }
    update.mutate(
      {
        display_name: parsed.data.displayName,
        username: parsed.data.username,
        bio: parsed.data.bio || null,
        fitness_goal: parsed.data.fitnessGoal || null,
        avatar_url: avatar,
        preferred_activity_types: types,
      },
      {
        onSuccess: () => {
          toast.success('Profile updated');
          router.back();
        },
        onError: (e) => setError(toUserMessage(e)),
      },
    );
  };

  return (
    <Screen keyboard>
      <ScreenHeader title="Edit profile" />
      <View style={{ gap: spacing.lg }}>
        <AvatarPicker userId={userId} name={displayName} uri={avatar} onUploaded={setAvatar} />
        {avatar ? <Button label="Remove photo" variant="ghost" size="sm" onPress={() => setAvatar(null)} /> : null}
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={50} />
        <TextField label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))} autoCapitalize="none" maxLength={24} />
        <TextField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={280} hint={`${bio.length}/280`} />
        <TextField label="Fitness goal" value={goal} onChangeText={setGoal} maxLength={140} placeholder="e.g. Run a half marathon in spring" />
        <Text variant="smallStrong" tone="muted">
          Favourite activities
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {ACTIVITY_TYPES.map((t) => (
            <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} selected={types.includes(t)} onPress={() => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} />
          ))}
        </View>
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Button label="Save" size="lg" loading={update.isPending} onPress={() => void save()} fullWidth />
      </View>
    </Screen>
  );
}
