export const ACTIVITY_TYPES = ['run', 'indoor_run', 'walk', 'ride', 'hike', 'swim', 'workout', 'other'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivitySource = 'gps' | 'manual';
export type Visibility = 'public' | 'friends' | 'private';

/** Types that can be recorded with live GPS. Mirrors the activities_gps_outdoor constraint. */
export const GPS_ACTIVITY_TYPES: readonly ActivityType[] = ['run', 'walk', 'ride', 'hike'];
/** Types where distance is the primary measure (distance inputs shown in forms). */
export const DISTANCE_ACTIVITY_TYPES: readonly ActivityType[] = ['run', 'indoor_run', 'walk', 'ride', 'hike', 'swim'];

export interface ActivityTypeMeta {
  label: string;
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  /** Show pace (min/km) for foot sports, speed (km/h) for rides. */
  speedDisplay: 'pace' | 'speed' | 'none';
}

export const ACTIVITY_TYPE_META: Record<ActivityType, ActivityTypeMeta> = {
  run: { label: 'Run', icon: 'run', speedDisplay: 'pace' },
  indoor_run: { label: 'Indoor Run', icon: 'shoe-sneaker', speedDisplay: 'pace' },
  walk: { label: 'Walk', icon: 'walk', speedDisplay: 'pace' },
  ride: { label: 'Ride', icon: 'bike', speedDisplay: 'speed' },
  hike: { label: 'Hike', icon: 'hiking', speedDisplay: 'pace' },
  swim: { label: 'Swim', icon: 'swim', speedDisplay: 'pace' },
  workout: { label: 'Workout', icon: 'dumbbell', speedDisplay: 'none' },
  other: { label: 'Other', icon: 'lightning-bolt', speedDisplay: 'none' },
};

export function isGpsCapable(type: ActivityType): boolean {
  return GPS_ACTIVITY_TYPES.includes(type);
}

export function isDistanceType(type: ActivityType): boolean {
  return DISTANCE_ACTIVITY_TYPES.includes(type);
}

export const VISIBILITY_META: Record<Visibility, { label: string; description: string; icon: string }> = {
  public: { label: 'Everyone', description: 'Anyone on QuestFit can see it (friends only if your profile is friends-only).', icon: 'earth' },
  friends: { label: 'Friends', description: 'Only your friends can see it.', icon: 'account-multiple' },
  private: { label: 'Only me', description: 'Nobody else can see it. It still counts toward your challenges.', icon: 'lock' },
};
