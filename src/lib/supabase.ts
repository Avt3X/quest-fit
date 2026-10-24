import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database';

import { env } from './env';
import { sessionStorage } from './secure-session-storage';

export const supabase = createClient<Database>(
  env.isBackendConfigured ? env.supabaseUrl : 'http://localhost:54321',
  env.isBackendConfigured ? env.supabaseAnonKey : 'unconfigured-placeholder-key-unconfigured',
  {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    global: { headers: { 'x-client-info': 'questfit-app' } },
  },
);

// Token refresh only runs while the app is in the foreground (recommended for React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/**
 * Throws the PostgREST error so TanStack Query treats it as a failure. Without an error, list
 * queries, .single() and RPCs always carry data (void RPCs carry null, typed as undefined).
 */
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

/** For .maybeSingle() queries, where "no row" is a valid answer. */
export function unwrapMaybe<T>(result: { data: T; error: unknown }): T | null {
  if (result.error) throw result.error;
  return result.data;
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type Functions = Database['public']['Functions'];
