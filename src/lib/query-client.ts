import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { isNetworkError, isPermanentError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => !isPermanentError(error) && failureCount < 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: (failureCount, error) => isNetworkError(error) && failureCount < 1,
    },
  },
});

let wired = false;

/** Connects TanStack Query to app focus and connectivity on native platforms. */
export function wireQueryLifecycle() {
  if (wired || Platform.OS === 'web') return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
  );
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}
