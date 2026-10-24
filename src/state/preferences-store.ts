import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MeasurementSystem } from '@/domain/units';
import { DEFAULT_PALETTE, DEFAULT_THEME_ID, type ThemePalette } from '@/theme/registry';

export type Appearance = 'system' | 'light' | 'dark';

interface PreferencesState {
  appearance: Appearance;
  /** Cached copy of the equipped theme so the first frame is already themed. */
  themeId: string;
  palette: ThemePalette;
  /** Cached measurement system; the server copy in user_settings is authoritative. */
  measurementSystem: MeasurementSystem;
  hapticsEnabled: boolean;
  /** Lets an offline cold start skip onboarding for a user who already completed it. */
  onboardedUserId: string | null;
  /** The user chose screen-off (background) GPS tracking when permission allows. */
  backgroundTracking: boolean;
  setAppearance: (appearance: Appearance) => void;
  setOnboardedUserId: (id: string | null) => void;
  setBackgroundTracking: (enabled: boolean) => void;
  applyTheme: (themeId: string, palette: ThemePalette) => void;
  setMeasurementSystem: (system: MeasurementSystem) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  reset: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      appearance: 'system',
      themeId: DEFAULT_THEME_ID,
      palette: DEFAULT_PALETTE,
      measurementSystem: 'metric',
      hapticsEnabled: true,
      onboardedUserId: null,
      backgroundTracking: true,
      setAppearance: (appearance) => set({ appearance }),
      setOnboardedUserId: (onboardedUserId) => set({ onboardedUserId }),
      setBackgroundTracking: (backgroundTracking) => set({ backgroundTracking }),
      applyTheme: (themeId, palette) => set({ themeId, palette }),
      setMeasurementSystem: (measurementSystem) => set({ measurementSystem }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      reset: () => set({ themeId: DEFAULT_THEME_ID, palette: DEFAULT_PALETTE, measurementSystem: 'metric', onboardedUserId: null }),
    }),
    {
      name: 'questfit.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
