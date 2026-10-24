import type { Session } from '@supabase/supabase-js';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { toast } from '@/components/ui';
import { env } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  initializing: boolean;
  /** True between verifying a password-reset code and choosing the new password. */
  recovering: boolean;
  setRecovering: (value: boolean) => void;
  /** Marks the next SIGNED_OUT as intentional so no "session expired" message is shown. */
  expectSignOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(env.isBackendConfigured);
  const [recovering, setRecovering] = useState(false);
  const intentionalSignOut = useRef(false);
  const hadSession = useRef(false);

  useEffect(() => {
    if (!env.isBackendConfigured) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        hadSession.current = !!data.session;
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        setRecovering(false);
        if (hadSession.current && !intentionalSignOut.current) {
          toast.info('Your session ended. Please sign in again.', 'lock-clock');
        }
        intentionalSignOut.current = false;
      }
      hadSession.current = !!next;
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const expectSignOut = useCallback(() => {
    intentionalSignOut.current = true;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, userId: session?.user.id ?? null, initializing, recovering, setRecovering, expectSignOut }),
    [session, initializing, recovering, expectSignOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For screens that only render when signed in (guarded by the root navigator). */
export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('No signed-in user');
  return userId;
}
