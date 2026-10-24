import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Keeps the screen on while mounted. Unlike useKeepAwake, a release that races an activation
 * (fast unmount, or browsers that refuse a wake lock) is ignored instead of throwing.
 */
export function useScreenAwake(tag = 'questfit-recorder') {
  useEffect(() => {
    let cancelled = false;
    const activation = activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      cancelled = true;
      void activation.then(() => {
        if (cancelled) return Promise.resolve(deactivateKeepAwake(tag)).catch(() => undefined);
        return undefined;
      });
    };
  }, [tag]);
}
