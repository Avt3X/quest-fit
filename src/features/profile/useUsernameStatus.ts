import { useQuery } from '@tanstack/react-query';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usernameSchema } from '@/validation/schemas';

import { isUsernameAvailable } from './api';

export type UsernameStatus = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

/** Live availability feedback for a username field (server check is debounced). */
export function useUsernameStatus(username: string, current: string | null): UsernameStatus {
  const parsed = usernameSchema.safeParse(username);
  const candidate = parsed.success ? parsed.data : null;
  const debounced = useDebouncedValue(candidate, 400);
  const needsCheck = !!candidate && candidate !== current;
  const query = useQuery({
    queryKey: ['username-available', debounced],
    enabled: needsCheck && debounced === candidate,
    staleTime: 30_000,
    queryFn: () => isUsernameAvailable(debounced ?? ''),
  });
  if (!username) return 'idle';
  if (!candidate) return 'invalid';
  if (!needsCheck) return 'ok';
  if (debounced !== candidate || query.isFetching) return 'checking';
  if (query.data === false) return 'taken';
  return query.data ? 'ok' : 'idle';
}
