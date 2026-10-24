import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { deviceTimeZone } from '@/domain/periods';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

export async function signUpWithEmail(params: { email: string; password: string; displayName: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: { display_name: params.displayName, timezone: deviceTimeZone() },
    },
  });
  if (error) throw error;
  // With email confirmation enabled no session is returned until the address is verified.
  return { needsVerification: !data.session };
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) throw error;
}

export async function resendVerification(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  if (error) throw error;
}

/** Exchanges the emailed recovery code for a short-lived session that may set a new password. */
export async function verifyRecoveryCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** 'local' only clears this device (used after account deletion, when the server user is gone). */
export async function signOut(scope: 'global' | 'local' = 'global') {
  const { error } = await supabase.auth.signOut({ scope });
  if (error) throw error;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (!env.auth.apple || Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<'signed_in' | 'cancelled'> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
    if (error) throw error;
    return 'signed_in';
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw error;
  }
}

export async function signInWithGoogle(): Promise<'signed_in' | 'cancelled'> {
  const redirectTo = authRedirectUrl();
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return 'signed_in';
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  await completeAuthFromUrl(result.url);
  return 'signed_in';
}

/** Handles questfit://auth/callback?code=... (PKCE) links from OAuth and email confirmation. */
export async function completeAuthFromUrl(url: string): Promise<boolean> {
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  const errorDescription = typeof queryParams?.error_description === 'string' ? queryParams.error_description : null;
  if (errorDescription) throw new Error(errorDescription);
  if (!code) return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}
