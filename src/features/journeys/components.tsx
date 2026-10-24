import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, Chip, Icon, ProgressBar, Text } from '@/components/ui';
import { journeyPosition } from '@/domain/progress';
import { useUnits } from '@/hooks/useUnits';
import { useAppTheme } from '@/theme/ThemeProvider';

import type { Expedition, Journey } from './api';
import { JourneyArt } from './JourneyArt';

export function JourneyCard({ journey, expedition, width }: { journey: Journey; expedition?: Expedition | null; width?: number }) {
  const { spacing } = useAppTheme();
  const units = useUnits();
  const progress = expedition ? Number(expedition.progress_m) : 0;
  const pos = journeyPosition(progress, Number(journey.total_distance_m), journey.checkpoints);
  return (
    <Card
      padded={false}
      style={width ? { width } : undefined}
      onPress={() =>
        expedition
          ? router.push({ pathname: '/expedition/[id]', params: { id: expedition.id } })
          : router.push({ pathname: '/journey/[slug]', params: { slug: journey.slug } })
      }
      accessibilityLabel={`${journey.title}. ${units.distance(Number(journey.total_distance_m), 0)}.${expedition ? ` ${Math.round(pos.fraction * 100)} percent complete.` : ''}`}
    >
      <View style={{ height: 120, overflow: 'hidden' }}>
        <JourneyArt artKey={journey.art_key} id={`card-${journey.slug}`} />
        <View style={{ position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: 6 }}>
          {journey.is_fictional ? <Chip label="Fantasy" size="sm" /> : <Chip label={journey.region ?? 'Real world'} size="sm" />}
          {!journey.supports_solo ? <Chip label="Group only" size="sm" /> : null}
        </View>
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
        <Text variant="heading" numberOfLines={2}>
          {journey.title}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {journey.subtitle}
        </Text>
        {expedition ? (
          <View style={{ gap: 6, marginTop: spacing.sm }}>
            <ProgressBar value={pos.fraction} height={8} />
            <Text variant="small" tone="muted" tabular>
              {units.distance(pos.completedM)} of {units.distance(Number(journey.total_distance_m), 0)}
              {pos.next ? ` · next: ${pos.next.name}` : ' · complete'}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
            <Meta icon="map-marker-distance" text={units.distance(Number(journey.total_distance_m), 0)} />
            <Meta icon="flag-variant-outline" text={`${journey.checkpoints.length} stops`} />
            <Meta icon="gauge" text={journey.difficulty} />
          </View>
        )}
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: 'map-marker-distance' | 'flag-variant-outline' | 'gauge'; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>
        {text}
      </Text>
    </View>
  );
}
