import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { VisibilityPicker } from '@/components/VisibilityPicker';
import { Button, Chip, ErrorState, InlineNotice, LoadingState, Screen, ScreenHeader, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType, GPS_ACTIVITY_TYPES, type Visibility, isDistanceType } from '@/domain/activity-types';
import { eligibilityProblem, validateActivityMetrics } from '@/domain/activity-rules';
import { displayToMeters, formatDuration, metersToDisplay, parseDurationInput } from '@/domain/units';
import { type ActivityPatch, type ActivityRow, useActivity, useUpdateActivity } from '@/features/activities/api';
import { useUserId } from '@/features/auth/AuthProvider';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function EditActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const detail = useActivity(id, userId);
  if (detail.isPending) return <LoadingState />;
  const a = detail.data?.activity;
  if (!a || a.user_id !== userId) {
    return (
      <Screen>
        <ScreenHeader title="Edit activity" />
        <ErrorState message="Only the owner can edit this activity." />
      </Screen>
    );
  }
  return <EditActivityForm activity={a} />;
}

function EditActivityForm({ activity: a }: { activity: ActivityRow }) {
  const { spacing } = useAppTheme();
  const units = useUnits();
  const update = useUpdateActivity(a.id);
  const [title, setTitle] = useState(a.title);
  const [description, setDescription] = useState(a.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>(a.visibility);
  const [type, setType] = useState<ActivityType>(a.type);
  const [startedAt, setStartedAt] = useState<Date | null>(new Date(a.started_at));
  const [duration, setDuration] = useState(formatDuration(a.moving_time_s));
  const [distance, setDistance] = useState(a.distance_m ? metersToDisplay(a.distance_m, units.system).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);

  const manual = a.source === 'manual';
  const allowedTypes = manual ? ACTIVITY_TYPES : GPS_ACTIVITY_TYPES;

  const save = () => {
    setError(null);
    const patch: ActivityPatch = {};
    if (title.trim() && title.trim() !== a.title) patch.title = title.trim();
    if ((description.trim() || null) !== a.description) patch.description = description.trim() || null;
    if (visibility !== a.visibility) patch.visibility = visibility;
    if (type !== a.type) patch.type = type;
    if (manual) {
      const seconds = parseDurationInput(duration);
      if (seconds === null) return setError('Enter a duration like 45, 32:10 or 1:05:00.');
      const meters = isDistanceType(type) && distance.trim() ? displayToMeters(Number(distance.replace(',', '.')), units.system) : 0;
      if (!Number.isFinite(meters)) return setError('Enter the distance as a number.');
      const start = startedAt ?? new Date(a.started_at);
      const problems = validateActivityMetrics({ type, distanceM: meters, movingTimeS: seconds, elapsedTimeS: seconds, startedAt: start });
      if (problems.length) return setError(problems[0].message);
      const eligibility = eligibilityProblem(type, meters, seconds);
      if (eligibility) return setError(eligibility);
      if (seconds !== a.moving_time_s) {
        patch.moving_time_s = seconds;
        patch.elapsed_time_s = seconds;
      }
      if (meters !== a.distance_m) patch.distance_m = meters;
      if (start.toISOString() !== new Date(a.started_at).toISOString()) patch.started_at = start.toISOString();
    }
    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Activity updated');
        router.back();
      },
      onError: (e) => setError(toUserMessage(e)),
    });
  };

  return (
    <Screen keyboard>
      <ScreenHeader title="Edit activity" />
      <View style={{ gap: spacing.lg }}>
        {!manual ? <InlineNotice tone="info" icon="crosshairs-gps" title="GPS-recorded" message="Distance and time come from the recording and cannot be changed. You can still fix the type, title and privacy." /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {allowedTypes.map((t) => (
            <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
        <TextField label="Title" value={title} onChangeText={setTitle} maxLength={100} />
        <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={2000} />
        {manual ? (
          <>
            <DateTimeField label="Started" value={startedAt} onChange={setStartedAt} withTime maxDate={new Date()} />
            <TextField label="Duration" value={duration} onChangeText={setDuration} keyboardType="numbers-and-punctuation" />
            {isDistanceType(type) ? <TextField label="Distance" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" suffix={units.unit} /> : null}
          </>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <Text variant="smallStrong" tone="muted">
            Visibility
          </Text>
          <VisibilityPicker value={visibility} onChange={setVisibility} />
        </View>
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Button label="Save changes" size="lg" loading={update.isPending} onPress={save} fullWidth />
      </View>
    </Screen>
  );
}
