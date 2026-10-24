import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Button, Card, Chip, IconButton, InlineNotice, Screen, ScreenHeader, SegmentedControl, SwitchRow, Text, TextField, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META } from '@/domain/activity-types';
import { customWindow, deviceTimeZone, formatWindow, periodWindow, rollingWindow } from '@/domain/periods';
import { displayToMeters } from '@/domain/units';
import { type CreateChallengeInput, useCreateChallenge } from '@/features/challenges/api';
import { COVER_KEYS, ChallengeCover, MODE_META } from '@/features/challenges/components';
import { useUnits } from '@/hooks/useUnits';
import { toUserMessage } from '@/lib/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type ChallengeFormValues, challengeFormSchema } from '@/validation/schemas';

const TEAM_COLORS = ['#FF7A45', '#3BA8FF', '#7CCB4E', '#B58CFF', '#F5C451', '#FF8FA3'];

export default function CreateChallengeScreen() {
  const { spacing, radii, colors } = useAppTheme();
  const units = useUnits();
  const create = useCreateChallenge();
  const [cover, setCover] = useState('trailhead');
  const [earliestStart] = useState(() => new Date(Date.now() - 30 * 86_400_000));
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ChallengeFormValues>({
    resolver: zodResolver(challengeFormSchema),
    defaultValues: {
      title: '',
      description: '',
      mode: 'individual',
      metric: 'distance',
      goal: '',
      activityTypes: ['run', 'indoor_run'],
      window: 'monthly',
      recurring: false,
      customStart: null,
      customEnd: null,
      visibility: 'public',
      allowManual: true,
      teams: [
        { name: 'Team Ember', color: TEAM_COLORS[0] },
        { name: 'Team Tide', color: TEAM_COLORS[1] },
      ],
    },
  });
  const teams = useFieldArray({ control, name: 'teams' });
  const mode = useWatch({ control, name: 'mode' });
  const metric = useWatch({ control, name: 'metric' });
  const windowKind = useWatch({ control, name: 'window' });
  const recurring = useWatch({ control, name: 'recurring' });
  const customStart = useWatch({ control, name: 'customStart' });
  const customEnd = useWatch({ control, name: 'customEnd' });

  const goalUnit = metric === 'distance' ? units.unit : metric === 'duration' ? 'hours' : 'activities';
  const now = new Date();
  const preview =
    windowKind === 'custom'
      ? customStart && customEnd
        ? customWindow(customStart, customEnd)
        : null
      : recurring
        ? periodWindow(windowKind, now)
        : rollingWindow(windowKind, now);

  const onSubmit = handleSubmit((v) => {
    setError(null);
    if (!preview) return setError('Pick the challenge dates.');
    const goal = v.goal.trim() ? Number(v.goal.replace(',', '.')) : null;
    const target = goal === null ? null : v.metric === 'distance' ? displayToMeters(goal, units.system) : v.metric === 'duration' ? Math.round(goal * 3600) : Math.round(goal);
    const input: CreateChallengeInput = {
      title: v.title.trim(),
      description: v.description?.trim() || undefined,
      mode: v.mode,
      metric: v.metric,
      target_value: target,
      activity_types: v.activityTypes,
      allow_manual: v.allowManual,
      period: v.window,
      recurrence: v.window !== 'custom' && v.recurring ? v.window : 'none',
      timezone: deviceTimeZone(),
      starts_at: preview.start.toISOString(),
      ends_at: preview.end.toISOString(),
      visibility: v.visibility,
      teams: v.mode === 'team' ? v.teams.map((t) => ({ name: t.name.trim(), color: t.color })) : undefined,
      cover_art: cover,
    };
    create.mutate(input, {
      onSuccess: (id) => {
        toast.success('Challenge created');
        router.replace({ pathname: '/challenge/[id]', params: { id } });
      },
      onError: (e) => setError(toUserMessage(e)),
    });
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <ScreenHeader title="New challenge" subtitle="Set a goal, invite friends, move together." />
      <View style={{ gap: spacing.lg }}>
        <View style={{ borderRadius: radii.xl, overflow: 'hidden' }}>
          <ChallengeCover cover={cover} mode={mode} height={90} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {COVER_KEYS.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityLabel={`Cover ${k}`}
              aria-checked={cover === k}
              onPress={() => setCover(k)}
              style={{ width: 44, height: 32, borderRadius: radii.sm, overflow: 'hidden', borderWidth: 2, borderColor: cover === k ? colors.accent : 'transparent' }}
            >
              <ChallengeCover cover={k} mode={mode} height={32} style={{ padding: 0 }} />
            </Pressable>
          ))}
        </View>

        <Controller control={control} name="title" render={({ field, fieldState }) => <TextField label="Title" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} maxLength={80} placeholder="e.g. October Hill Repeats" />} />
        <Controller control={control} name="description" render={({ field }) => <TextField label="Description (optional)" value={field.value ?? ''} onChangeText={field.onChange} multiline maxLength={1000} />} />

        <Text variant="heading">Format</Text>
        <Controller
          control={control}
          name="mode"
          render={({ field }) => (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {(Object.keys(MODE_META) as (keyof typeof MODE_META)[]).map((m) => (
                  <Chip key={m} label={MODE_META[m].label} icon={MODE_META[m].icon} selected={field.value === m} onPress={() => field.onChange(m)} />
                ))}
              </View>
              <Text variant="small" tone="muted">
                {MODE_META[field.value].description}
              </Text>
            </View>
          )}
        />

        <Controller
          control={control}
          name="metric"
          render={({ field }) => (
            <SegmentedControl
              options={[
                { value: 'distance', label: 'Distance', icon: 'map-marker-distance' },
                { value: 'duration', label: 'Time', icon: 'timer-outline' },
                { value: 'count', label: 'Activities', icon: 'counter' },
              ]}
              value={field.value}
              onChange={field.onChange}
              accessibilityLabel="Measure"
            />
          )}
        />
        <Controller
          control={control}
          name="goal"
          render={({ field, fieldState }) => (
            <TextField
              label={mode === 'competitive' || mode === 'team' ? 'Goal (optional)' : 'Goal'}
              value={field.value}
              onChangeText={field.onChange}
              keyboardType="decimal-pad"
              suffix={goalUnit}
              error={fieldState.error?.message}
              hint={mode === 'collaborative' ? 'Everyone’s total combined.' : mode === 'team' ? 'Per team. Without a goal, the highest team total wins.' : mode === 'competitive' ? 'Without a goal, the highest total wins.' : undefined}
            />
          )}
        />

        <Text variant="heading">What counts</Text>
        <Controller
          control={control}
          name="activityTypes"
          render={({ field, fieldState }) => (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {ACTIVITY_TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={ACTIVITY_TYPE_META[t].label}
                    icon={toIconName(ACTIVITY_TYPE_META[t].icon)}
                    selected={field.value.includes(t)}
                    onPress={() => field.onChange(field.value.includes(t) ? field.value.filter((x) => x !== t) : [...field.value, t])}
                  />
                ))}
              </View>
              {fieldState.error ? (
                <Text variant="small" tone="danger">
                  {fieldState.error.message}
                </Text>
              ) : null}
            </View>
          )}
        />
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <Controller control={control} name="allowManual" render={({ field }) => <SwitchRow title="Allow manual entries" subtitle="Turn off to count GPS-recorded activities only." icon="pencil-outline" value={field.value} onValueChange={field.onChange} />} />
        </Card>

        <Text variant="heading">When</Text>
        <Controller
          control={control}
          name="window"
          render={({ field }) => (
            <SegmentedControl
              options={[
                { value: 'weekly', label: recurring ? 'Week' : '7 days' },
                { value: 'monthly', label: recurring ? 'Month' : '1 month' },
                { value: 'yearly', label: recurring ? 'Year' : '1 year' },
                { value: 'custom', label: 'Custom' },
              ]}
              value={field.value}
              onChange={field.onChange}
              accessibilityLabel="Challenge length"
            />
          )}
        />
        {windowKind === 'custom' ? (
          <View style={{ gap: spacing.md }}>
            <Controller control={control} name="customStart" render={({ field }) => <DateTimeField label="First day" value={field.value} onChange={field.onChange} minDate={earliestStart} />} />
            <Controller control={control} name="customEnd" render={({ field, fieldState }) => <DateTimeField label="Last day" value={field.value} onChange={field.onChange} minDate={customStart ?? new Date()} error={fieldState.error?.message} />} />
          </View>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <Controller
              control={control}
              name="recurring"
              render={({ field }) => (
                <SwitchRow title={`Repeat every ${windowKind === 'weekly' ? 'week' : windowKind === 'monthly' ? 'month' : 'year'}`} subtitle="A fresh challenge starts each period and participants are re-enrolled." icon="repeat" value={field.value} onValueChange={field.onChange} />
              )}
            />
          </Card>
        )}
        {preview ? (
          <Text variant="small" tone="muted">
            {formatWindow(preview.start, preview.end)} · times in {deviceTimeZone()}
          </Text>
        ) : null}

        {mode === 'team' ? (
          <>
            <Text variant="heading">Teams</Text>
            {teams.fields.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.color, marginBottom: 20 }} />
                <View style={{ flex: 1 }}>
                  <Controller control={control} name={`teams.${i}.name`} render={({ field, fieldState }) => <TextField label={`Team ${i + 1}`} value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} maxLength={30} />} />
                </View>
                {teams.fields.length > 2 ? <IconButton icon="close" accessibilityLabel={`Remove team ${i + 1}`} onPress={() => teams.remove(i)} style={{ marginBottom: 6 }} /> : null}
              </View>
            ))}
            {formState.errors.teams?.message ? (
              <Text variant="small" tone="danger">
                {formState.errors.teams.message}
              </Text>
            ) : null}
            {teams.fields.length < 6 ? <Button label="Add team" icon="plus" variant="ghost" onPress={() => teams.append({ name: `Team ${teams.fields.length + 1}`, color: TEAM_COLORS[teams.fields.length % TEAM_COLORS.length] })} /> : null}
          </>
        ) : null}

        <Text variant="heading">Who can join</Text>
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <View style={{ gap: spacing.sm }}>
              <SegmentedControl
                options={[
                  { value: 'public', label: 'Anyone', icon: 'earth' },
                  { value: 'private', label: 'Invite only', icon: 'lock' },
                ]}
                value={field.value}
                onChange={field.onChange}
              />
              <Text variant="small" tone="muted">
                {field.value === 'public' ? 'Listed in Explore. Anyone can join.' : 'Hidden from Explore. Friends join via invitation or invite code.'}
              </Text>
            </View>
          )}
        />

        {error ? <InlineNotice tone="danger" title={error} /> : null}
        <Button label="Create challenge" icon="flag-plus" size="lg" loading={create.isPending} onPress={() => void onSubmit()} fullWidth testID="create-challenge" />
      </View>
    </Screen>
  );
}
