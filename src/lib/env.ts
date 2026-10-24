import Constants from 'expo-constants';

// EXPO_PUBLIC_* values are inlined at build time and must be read with direct property access.
// Only public values belong here: the Supabase anon/publishable key is designed to ship in apps and
// is constrained by Row Level Security. Never put a service-role key in an EXPO_PUBLIC_ variable.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  isBackendConfigured: supabaseUrl.startsWith('http') && supabaseAnonKey.length > 20,
  auth: {
    /** Requires the Google provider to be enabled in Supabase Auth. */
    google: process.env.EXPO_PUBLIC_AUTH_GOOGLE_ENABLED === 'true',
    /** Requires the Apple provider in Supabase Auth and an iOS build with Sign in with Apple. */
    apple: process.env.EXPO_PUBLIC_AUTH_APPLE_ENABLED === 'true',
  },
  easProjectId: (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? null,
  appScheme: 'questfit',
} as const;
