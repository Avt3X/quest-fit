import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Icon, Text, toIconName } from '@/components/ui';
import { TIER_COLORS } from '@/features/gamification/api';
import { useUnits } from '@/hooks/useUnits';
import { relativeTime } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';

import type { FeedItem } from '../api';
import { ActivityCard } from './ActivityCard';

export function FeedItemView({ item, viewerId }: { item: FeedItem; viewerId: string }) {
  const { colors, spacing } = useAppTheme();
  const units = useUnits();
  const isMine = item.actor.id === viewerId;
  if (item.kind === 'activity') return <ActivityCard activity={item.activity} actor={item.actor} isMine={isMine} />;

  let icon = 'trophy';
  let color = colors.secondary;
  let headline = '';
  let detail = '';
  let onPress: (() => void) | undefined;
  if (item.kind === 'achievement') {
    icon = item.achievement.icon;
    color = TIER_COLORS[item.achievement.tier as keyof typeof TIER_COLORS] ?? colors.secondary;
    headline = `earned ${item.achievement.title}`;
    detail = item.achievement.description;
    onPress = () => router.push({ pathname: '/user/[id]', params: { id: item.actor.id } });
  } else if (item.kind === 'challenge_completed') {
    icon = 'flag-checkered';
    color = colors.accent;
    headline = `completed ${item.challenge.title}`;
    detail = units.metric(item.challenge.metric, Number(item.challenge.value));
    onPress = () => router.push({ pathname: '/challenge/[id]', params: { id: item.challenge.challenge_id } });
  } else {
    icon = 'map-marker-check';
    color = colors.accent;
    headline = `finished ${item.journey.title}`;
    detail = `${units.distance(Number(item.journey.total_m), 0)} ${item.journey.mode === 'group' ? 'with their party' : 'solo'}`;
    onPress = () => router.push({ pathname: '/journey/[slug]', params: { slug: item.journey.journey_slug } });
  }
  return (
    <Card onPress={onPress} accessibilityLabel={`${isMine ? 'You' : item.actor.display_name} ${headline}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View>
          <Avatar name={item.actor.display_name} uri={item.actor.avatar_url} size={40} />
          <View style={{ position: 'absolute', right: -6, bottom: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
            <Icon name={toIconName(icon)} size={13} color="#FFFFFF" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={2}>
            <Text variant="bodyStrong">{isMine ? 'You' : item.actor.display_name}</Text> {headline}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {detail} · {relativeTime(item.occurredAt)}
          </Text>
        </View>
      </View>
    </Card>
  );
}
