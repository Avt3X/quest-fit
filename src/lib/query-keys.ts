import type { ActivityType } from '@/domain/activity-types';

export const qk = {
  me: (userId: string | null) => ['me', userId] as const,
  themes: ['themes'] as const,
  unlockedThemes: (userId: string | null) => ['unlocked-themes', userId] as const,
  levels: ['levels'] as const,
  publicProfile: (userId: string) => ['public-profile', userId] as const,
  userActivities: (userId: string) => ['user-activities', userId] as const,

  feed: ['feed'] as const,
  myActivities: (filters: { types: ActivityType[]; range: string }) => ['my-activities', filters] as const,
  myActivitiesAll: ['my-activities'] as const,
  activity: (id: string) => ['activity', id] as const,
  activityRoute: (id: string) => ['activity-route', id] as const,
  activitySummary: (id: string) => ['activity-summary', id] as const,
  comments: (activityId: string) => ['comments', activityId] as const,
  stats: (key: string) => ['stats', key] as const,
  statsAll: ['stats'] as const,
  records: ['records'] as const,

  challenges: (filters: object) => ['challenges', filters] as const,
  challengesAll: ['challenges'] as const,
  myChallenges: ['my-challenges'] as const,
  challenge: (id: string) => ['challenge', id] as const,
  leaderboard: (id: string, scope: string) => ['challenge-leaderboard', id, scope] as const,
  leaderboardAll: ['challenge-leaderboard'] as const,
  globalLeaderboard: (period: string, scope: string, metric: string) => ['leaderboard', period, scope, metric] as const,

  journeys: ['journeys'] as const,
  journey: (slug: string) => ['journey', slug] as const,
  myExpeditions: ['my-expeditions'] as const,
  expedition: (id: string) => ['expedition', id] as const,

  friends: ['friends'] as const,
  blocked: ['blocked'] as const,
  search: (q: string) => ['search', q] as const,

  notifications: ['notifications'] as const,
  unreadCount: ['unread-count'] as const,
  invitations: ['invitations'] as const,

  achievements: ['achievements'] as const,
  xpHistory: ['xp-history'] as const,
};
