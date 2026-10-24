import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile } from '@/features/profile/api';
import { env } from '@/lib/env';
import { usePreferences } from '@/state/preferences-store';

/** Entry point and fallback anchor: sends people to the right place for their auth state. */
export default function IndexRedirect() {
  const { session, recovering } = useAuth();
  const profile = useMyProfile();
  const onboardedUserId = usePreferences((s) => s.onboardedUserId);
  if (!env.isBackendConfigured) return <Redirect href="/setup" />;
  if (recovering) return <Redirect href="/reset-password" />;
  if (!session) return <Redirect href="/welcome" />;
  const onboarded = profile.data ? !!profile.data.profile.onboarding_completed_at : onboardedUserId === session.user.id;
  return <Redirect href={onboarded ? '/home' : '/onboarding'} />;
}
