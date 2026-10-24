import { useMemo } from 'react';

import { ACTIVITY_TYPE_META, type ActivityType } from '@/domain/activity-types';
import {
  type MeasurementSystem,
  distanceUnitLabel,
  formatDistance,
  formatDistanceCompact,
  formatElevation,
  formatMetricValue,
  formatPace,
  formatSpeed,
} from '@/domain/units';
import { usePreferences } from '@/state/preferences-store';

export function useUnits() {
  const system = usePreferences((s) => s.measurementSystem);
  return useMemo(() => bindUnits(system), [system]);
}

export function bindUnits(system: MeasurementSystem) {
  return {
    system,
    unit: distanceUnitLabel(system),
    distance: (m: number, digits?: number) => formatDistance(m, system, { fractionDigits: digits }),
    distanceValue: (m: number, digits?: number) => formatDistance(m, system, { fractionDigits: digits, withUnit: false }),
    compact: (m: number) => formatDistanceCompact(m, system),
    elevation: (m: number) => formatElevation(m, system),
    pace: (mps: number) => formatPace(mps, system),
    speed: (mps: number) => formatSpeed(mps, system),
    metric: (metric: 'distance' | 'duration' | 'count', v: number) => formatMetricValue(metric, v, system),
    /** Pace for foot sports, speed for rides, nothing for workouts. */
    speedFor: (type: ActivityType, mps: number): { label: string; value: string } | null => {
      const mode = ACTIVITY_TYPE_META[type].speedDisplay;
      if (mode === 'none' || mps <= 0) return null;
      return mode === 'speed' ? { label: 'Avg speed', value: formatSpeed(mps, system) } : { label: 'Avg pace', value: formatPace(mps, system) };
    },
  };
}
