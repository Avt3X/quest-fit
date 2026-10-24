import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { type LocationReadiness, getLocationReadiness } from './location-service';

/** Re-checks permissions on focus and when returning from the system Settings app. */
export function useLocationReadiness() {
  const [readiness, setReadiness] = useState<LocationReadiness | null>(null);
  const refresh = useCallback(() => {
    getLocationReadiness().then(setReadiness, () => setReadiness(null));
  }, []);
  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );
  return { readiness, refresh };
}
