// Maps errors from Supabase (PostgREST, Auth, Storage), the network layer and the database's
// own validation messages to user-facing text. Database RPCs raise messages written for users,
// with SQLSTATE codes that classify them.

interface CodedError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

function asCoded(error: unknown): CodedError {
  if (error && typeof error === 'object') return error as CodedError;
  return { message: typeof error === 'string' ? error : undefined };
}

export function isNetworkError(error: unknown): boolean {
  const e = asCoded(error);
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed')
  );
}

/** The request reached the server and was rejected for a reason a retry will not fix. */
export function isPermanentError(error: unknown): boolean {
  const e = asCoded(error);
  if (isNetworkError(error)) return false;
  if (e.code && /^(22|23|42|P0|28|54)/.test(e.code)) return true;
  return typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
}

export function isSessionError(error: unknown): boolean {
  const e = asCoded(error);
  return e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || (e.message ?? '').toLowerCase().includes('jwt expired');
}

export function toUserMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (isNetworkError(error)) return 'You appear to be offline. Check your connection and try again.';
  const e = asCoded(error);
  if (isSessionError(error)) return 'Your session has expired. Please sign in again.';
  switch (e.code) {
    case '23505':
      if ((e.message ?? '').includes('profiles_username_key')) return 'That username is already taken.';
      return e.message && !e.message.includes('duplicate key') ? e.message : 'That already exists.';
    case '23503':
      return 'That item is no longer available.';
    case '23514':
      return 'Some of the values are outside the allowed range.';
    case '42501':
      return e.message && !e.message.startsWith('permission denied') ? e.message : 'You do not have permission to do that.';
    default:
      break;
  }
  const message = e.message ?? '';
  if (message === 'Invalid login credentials') return 'Incorrect email or password.';
  if (message.toLowerCase().includes('email not confirmed')) return 'Please verify your email first. We sent you a 6-digit code.';
  if (message.toLowerCase().includes('token has expired or is invalid')) return 'That code is invalid or has expired. Request a new one.';
  if (message.toLowerCase().includes('user already registered')) return 'An account with this email already exists. Try signing in.';
  if (message.toLowerCase().includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (message && message.length < 240 && !message.includes('violates') && !message.includes('relation "')) return message;
  return fallback;
}
