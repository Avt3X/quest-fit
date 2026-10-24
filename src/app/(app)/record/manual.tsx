import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { VisibilityPicker } from '@/components/VisibilityPicker';
import { Button, Chip, InlineNotice, Screen, ScreenHeader, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType, isDistanceType } from '@/domain/activity-types';
import { deviceTimeZone } from '@/domain/periods';
import { displayToMeters, parseDurationInput } from '@/domain/units';
import { parseSummary } from '@/features/activities/api';
import { useMyProfile } from '@/features/profile/api';
import { flushUploads, useUploadQueue } from '@/features/recording/upload-queue';
import { useUnits } from '@/hooks/useUnits';
import { qk } from '@/lib/query-keys';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type ManualActivityValues, manualActivitySchema } from '@/validation/schemas';

function isActivityType(v: unknown): v is ActivityType {
  return typeof v === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(v);
}

export default function ManualActivityScreen() {
  const { spacing } = useAppTheme();
  const units = useUnits();
  const me = useMyProfile();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ type?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [clientId] = useState(() => Crypto.randomUUID());
  const [oldestAllowed] = useState(() => new Date(Date.now() - 365 * 86_400_000));

  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  defaultStart.setHours(defaultStart.getHours() - 1);

  const { control, handleSubmit, setValue, formState } = useForm<ManualActivityValues>({
    resolver: zodResolver(manualActivitySchema),
    defaultValues: {
      type: isActivityType(params.type) ? params.type : 'run',
      title: '',
      description: '',
      startedAt: defaultStart,
      duration: '',
      distance: '',
      distanceMeters: 0,
      visibility: 'friends',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const distance = useWatch({ control, name: 'distance' });
  useEffect(() => {
    const value = Number(distance.replace(',', '.'));
    setValue('distanceMeters', distance.trim() && Number.isFinite(value) ? displayToMeters(value, units.system) : 0);
  }, [distance, units.system, setValue]);

  const defaultVisibility = me.data?.settings.default_activity_visibility;
  useEffect(() => {
    if (defaultVisibility) setValue('visibility', defaultVisibility);
  }, [defaultVisibility, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const seconds = parseDurationInput(values.duration) ?? 0;
    useUploadQueue.getState().enqueue({
      clientId,
      type: values.type,
      source: 'manual',
      startedAt: values.startedAt.toISOString(),
      elapsedTimeS: seconds,
      movingTimeS: seconds,
      distanceM: isDistanceType(values.type) ? values.distanceMeters : 0,
      elevationGainM: null,
      title: values.title?.trim() || null,
      description: values.description?.trim() || null,
      visibility: values.visibility,
      timezone: deviceTimeZone(),
      hasTrack: false,
    });
    await flushUploads();
    const result = useUploadQueue.getState().results[clientId];
    if (result) {
      queryClient.setQueryData(qk.activitySummary(result.activityId), parseSummary(result.summary));
      router.replace({ pathname: '/activity/summary/[id]', params: { id: result.activityId } });
      return;
    }
    const item = useUploadQueue.getState().items.find((i) => i.clientId === clientId);
    if (item?.status === 'failed') {
      await useUploadQueue.getState().remove(clientId);
      setError(item.lastError ?? 'The activity could not be saved.');
      return;
    }
    toast.info('Saved on this device. It will upload when you are online.', 'cloud-upload-outline');
    router.back();
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="Log an activity" subtitle="For workouts recorded elsewhere or without GPS." />
      <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
        <InlineNotice tone="info" icon="pencil-outline" title="Logged manually" message="Manual entries are labelled as such and never show a route. Some challenges only accept GPS activities." />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {ACTIVITY_TYPES.map((t) => (
                <Chip key={t} label={ACTIVITY_TYPE_META[t].label} icon={toIconName(ACTIVITY_TYPE_META[t].icon)} selected={field.value === t} onPress={() => field.onChange(t)} />
              ))}
            </View>
          )}
        />
        <Controller
          control={control}
          name="startedAt"
          render={({ field, fieldState }) => (
            <DateTimeField label="Started" value={field.value} onChange={field.onChange} withTime maxDate={new Date()} minDate={oldestAllowed} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="duration"
          render={({ field, fieldState }) => (
            <TextField label="Duration" value={field.value} onChangeText={field.onChange} placeholder="45 or 32:10 or 1:05:00" keyboardType="numbers-and-punctuation" error={fieldState.error?.message} hint="Minutes, mm:ss or h:mm:ss" />
          )}
        />
        {isDistanceType(type) ? (
          <Controller
            control={control}
            name="distance"
            render={({ field, fieldState }) => (
              <TextField label="Distance" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="5.0" suffix={units.unit} error={fieldState.error?.message} />
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => <TextField label="Title (optional)" value={field.value ?? ''} onChangeText={field.onChange} error={fieldState.error?.message} maxLength={100} />}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => <TextField label="Description (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline maxLength={2000} />}
        />
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <View style={{ gap: spacing.sm }}>
              <Text variant="smallStrong" tone="muted">
                Visibility
              </Text>
              <VisibilityPicker value={field.value} onChange={field.onChange} />
            </View>
          )}
        />
        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Button label="Save activity" icon="check" size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()} fullWidth testID="save-manual" />
      </View>
    </Screen>
  );
}
