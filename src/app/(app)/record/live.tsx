import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VisibilityPicker } from '@/components/VisibilityPicker';
import { Button, Chip, Icon, IconButton, InlineNotice, LoadingState, Text, TextField, confirm, toIconName, toast } from '@/components/ui';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType, type Visibility, isDistanceType, isGpsCapable } from '@/domain/activity-types';
import { MAX_DISTANCE_M, eligibilityProblem } from '@/domain/activity-rules';
import { elevationGainMeters } from '@/domain/gps-filter';
import { deviceTimeZone } from '@/domain/periods';
import {
  type GpsSignal,
  averageSpeedOf,
  currentSpeed,
  elapsedTimeMs,
  gpsSignal,
  movingTimeMs,
  saveReadiness,
} from '@/domain/recording';
import { displayToMeters, formatDuration } from '@/domain/units';
import { parseSummary } from '@/features/activities/api';
import { RouteMap } from '@/features/activities/components/RouteMap';
import { useMyProfile } from '@/features/profile/api';
import { type TrackingMode, startTracking, stopTracking } from '@/features/recording/location-service';
import { useRecording } from '@/features/recording/recording-store';
import { flushUploads, useUploadQueue } from '@/features/recording/upload-queue';
import { useScreenAwake } from '@/hooks/useScreenAwake';
import { useUnits } from '@/hooks/useUnits';
import { haptics } from '@/lib/haptics';
import { qk } from '@/lib/query-keys';
import { usePreferences } from '@/state/preferences-store';
import { useAppTheme } from '@/theme/ThemeProvider';

function isActivityType(v: unknown): v is ActivityType {
  return typeof v === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(v);
}

const SIGNAL_META: Record<GpsSignal, { label: string; icon: string; tone: 'accent' | 'secondary' | 'default' }> = {
  disabled: { label: 'Timer only', icon: 'timer-outline', tone: 'default' },
  searching: { label: 'Finding GPS…', icon: 'crosshairs-question', tone: 'secondary' },
  good: { label: 'GPS good', icon: 'crosshairs-gps', tone: 'accent' },
  weak: { label: 'Weak GPS', icon: 'crosshairs', tone: 'secondary' },
  lost: { label: 'GPS lost', icon: 'crosshairs-off', tone: 'secondary' },
};

export default function LiveRecorderScreen() {
  useScreenAwake();
  const { colors, spacing } = useAppTheme();
  const units = useUnits();
  const params = useLocalSearchParams<{ type?: string; gps?: string }>();
  const hydrated = useRecording((s) => s.hydrated);
  const session = useRecording((s) => s.session);
  const livePoints = useRecording((s) => s.livePoints);
  const backgroundPref = usePreferences((s) => s.backgroundTracking);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<TrackingMode | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const current = useRecording.getState().session;
    if (current) return;
    if (isActivityType(params.type)) {
      useRecording.getState().start(params.type, params.gps === '1' && isGpsCapable(params.type));
      haptics.heavy();
    } else {
      router.replace('/record');
    }
  }, [hydrated, params.type, params.gps]);

  const status = session?.status;
  const usesGps = session?.usesGps ?? false;
  const clientId = session?.clientId;

  useEffect(() => {
    if (!usesGps || !clientId) return;
    if (status === 'recording') {
      startTracking(backgroundPref).then(
        (m) => {
          setMode(m);
          setTrackingError(null);
        },
        (e: unknown) => setTrackingError(e instanceof Error ? e.message : 'Location updates could not start.'),
      );
    } else {
      void stopTracking();
    }
  }, [status, usesGps, clientId, backgroundPref]);

  useEffect(() => {
    if (clientId) void useRecording.getState().loadLivePoints();
  }, [clientId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const beat = setInterval(() => useRecording.getState().beat(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, []);

  if (!session) return <LoadingState label="Preparing recorder…" />;

  const meta = ACTIVITY_TYPE_META[session.type];
  const moving = movingTimeMs(session, now) / 1000;
  const elapsed = elapsedTimeMs(session, now) / 1000;
  const signal = gpsSignal(session, now);
  const signalMeta = SIGNAL_META[signal];
  const speedMode = meta.speedDisplay;
  const live = currentSpeed(session);
  const avg = averageSpeedOf(session, now);
  const last = livePoints.length ? livePoints[livePoints.length - 1] : null;

  const discard = async () => {
    const ok = await confirm({
      title: 'Discard this activity?',
      message: 'The recording and its route will be deleted from this device. This cannot be undone.',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (!ok) return;
    await stopTracking();
    await useRecording.getState().discard();
    haptics.warning();
    router.replace('/record');
  };

  if (session.status === 'finished') {
    return <ReviewPanel now={now} onDiscard={discard} />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }} testID="live-recorder">
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
        <IconButton icon="chevron-down" accessibilityLabel="Minimise recorder (keeps recording)" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} variant="filled" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={toIconName(meta.icon)} size={18} />
            <Text variant="bodyStrong">{meta.label}</Text>
          </View>
          <Text variant="caption" tone={session.status === 'paused' ? 'warning' : 'muted'}>
            {session.status === 'paused' ? 'Paused' : 'Recording'}
          </Text>
        </View>
        <Chip label={signalMeta.label} icon={toIconName(signalMeta.icon)} size="sm" tone={signalMeta.tone} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {session.interruptedAt ? (
          <InlineNotice tone="warning" title="Recording was interrupted" message={`QuestFit stopped at ${new Date(session.interruptedAt).toLocaleTimeString()}. Time after that is not counted. Resume to continue or finish to save.`} />
        ) : null}
        {trackingError ? <InlineNotice tone="danger" title="GPS could not start" message={trackingError} /> : null}
        {usesGps && mode === 'foreground' && session.status === 'recording' ? (
          <InlineNotice
            tone="info"
            icon="cellphone-screenshot"
            title="Keep QuestFit open"
            message={Platform.OS === 'web' ? 'Browsers only track location while this tab is open and visible.' : 'Background location is off, so tracking pauses if you leave the app. Enable screen-off tracking on the Record tab.'}
          />
        ) : null}

        {usesGps ? <RouteMap points={livePoints.map((p) => ({ lat: p.lat, lng: p.lng, segment: p.seg }))} live current={last} height={260} /> : null}

        <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text variant="overline" tone="muted">
            Moving time
          </Text>
          <Text variant="metricLarge" tabular accessibilityLabel={`Moving time ${formatDuration(moving)}`} style={{ fontSize: 72, lineHeight: 78 }}>
            {formatDuration(moving)}
          </Text>
          <Text variant="small" tone="muted" tabular>
            Elapsed {formatDuration(elapsed)}
          </Text>
        </Animated.View>

        {usesGps ? (
          <View style={styles.metrics}>
            <Metric label="Distance" value={units.distanceValue(session.distanceM, 2)} unit={units.unit} />
            {speedMode === 'speed' ? (
              <>
                <Metric label="Speed" value={units.speed(live).split(' ')[0]} unit={units.system === 'imperial' ? 'mph' : 'km/h'} />
                <Metric label="Avg speed" value={units.speed(avg).split(' ')[0]} unit={units.system === 'imperial' ? 'mph' : 'km/h'} />
              </>
            ) : (
              <>
                <Metric label="Pace" value={units.pace(live).split(' ')[0]} unit={`/${units.unit}`} />
                <Metric label="Avg pace" value={units.pace(avg).split(' ')[0]} unit={`/${units.unit}`} />
              </>
            )}
          </View>
        ) : (
          <InlineNotice tone="info" icon="timer-outline" title="Timer-only session" message="No GPS is used. You can enter the distance from your treadmill or watch when you finish." />
        )}
      </ScrollView>

      <View style={[styles.controls, { padding: spacing.lg, gap: spacing.md, borderTopColor: colors.border }]}>
        {session.status === 'recording' ? (
          <Button
            label="Pause"
            icon="pause"
            size="lg"
            variant="secondary"
            haptic="medium"
            onPress={() => useRecording.getState().pause()}
            style={{ flex: 1 }}
            testID="pause-recording"
          />
        ) : (
          <>
            <Button label="Resume" icon="play" size="lg" haptic="medium" onPress={() => useRecording.getState().resume()} style={{ flex: 1 }} testID="resume-recording" />
            <Button
              label="Finish"
              icon="flag-checkered"
              size="lg"
              variant="outline"
              haptic="medium"
              onPress={() => {
                useRecording.getState().finish();
                void stopTracking();
              }}
              style={{ flex: 1 }}
              testID="finish-recording"
            />
          </>
        )}
        <IconButton icon="delete-outline" accessibilityLabel="Discard recording" variant="filled" color={colors.danger} onPress={() => void discard()} />
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  const { colors, radii, spacing } = useAppTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value} ${unit}`} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="metric" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="subtle">
        {unit}
      </Text>
    </View>
  );
}

function ReviewPanel({ now, onDiscard }: { now: number; onDiscard: () => void }) {
  const { colors, spacing } = useAppTheme();
  const units = useUnits();
  const queryClient = useQueryClient();
  const me = useMyProfile();
  const session = useRecording((s) => s.session);
  const livePoints = useRecording((s) => s.livePoints);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [distanceText, setDistanceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveVisibility: Visibility = visibility ?? me.data?.settings.default_activity_visibility ?? 'friends';
  const readiness = useMemo(() => (session ? saveReadiness(session, livePoints.length, now) : null), [session, livePoints.length, now]);
  if (!session || !readiness) return null;

  const meta = ACTIVITY_TYPE_META[session.type];
  const moving = Math.round(movingTimeMs(session, now) / 1000);
  const elapsed = Math.max(moving, Math.round(elapsedTimeMs(session, now) / 1000));
  const isGps = readiness.kind === 'ready' && readiness.source === 'gps';
  const needsDistance = !isGps && isDistanceType(session.type);

  const save = async () => {
    setError(null);
    let distanceM = Math.round(session.distanceM);
    if (!isGps) {
      const raw = distanceText.trim().replace(',', '.');
      const value = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(value) || value < 0) return setError('Enter the distance as a number, e.g. 5.2.');
      distanceM = displayToMeters(value, units.system);
      if (distanceM > MAX_DISTANCE_M[session.type]) return setError(`That is more than the ${MAX_DISTANCE_M[session.type] / 1000} km limit for this activity type.`);
      const problem = eligibilityProblem(session.type, distanceM, moving);
      if (problem) return setError(problem);
    }
    setSaving(true);
    const clientId = session.clientId;
    useUploadQueue.getState().enqueue({
      clientId,
      type: session.type,
      source: isGps ? 'gps' : 'manual',
      startedAt: new Date(session.startedAt).toISOString(),
      elapsedTimeS: elapsed,
      movingTimeS: moving,
      distanceM,
      elevationGainM: isGps ? elevationGainMeters(livePoints) || null : null,
      title: title.trim() || null,
      description: description.trim() || null,
      visibility: effectiveVisibility,
      timezone: deviceTimeZone(),
      hasTrack: isGps,
    });
    await stopTracking();
    useRecording.getState().release();
    await flushUploads();
    const result = useUploadQueue.getState().results[clientId];
    if (result) {
      queryClient.setQueryData(qk.activitySummary(result.activityId), parseSummary(result.summary));
      haptics.success();
      router.replace({ pathname: '/activity/summary/[id]', params: { id: result.activityId } });
      return;
    }
    const pending = useUploadQueue.getState().items.find((i) => i.clientId === clientId);
    if (pending?.status === 'failed') {
      toast.error(pending.lastError ?? 'The activity could not be saved.');
      router.replace('/uploads');
    } else {
      toast.info('Saved on this device. It will upload automatically when you are online.', 'cloud-upload-outline');
      router.replace('/');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown} style={{ gap: spacing.xs }}>
          <Text variant="overline" tone="accent">
            Nice work
          </Text>
          <Text variant="display">Save your {meta.label.toLowerCase()}</Text>
        </Animated.View>

        <View style={styles.metrics}>
          <Metric label="Time" value={formatDuration(moving)} unit="moving" />
          {isGps ? <Metric label="Distance" value={units.distanceValue(session.distanceM, 2)} unit={units.unit} /> : null}
          {isGps && meta.speedDisplay !== 'none' ? (
            meta.speedDisplay === 'speed' ? (
              <Metric label="Avg speed" value={units.speed(averageSpeedOf(session, now)).split(' ')[0]} unit={units.system === 'imperial' ? 'mph' : 'km/h'} />
            ) : (
              <Metric label="Avg pace" value={units.pace(averageSpeedOf(session, now)).split(' ')[0]} unit={`/${units.unit}`} />
            )
          ) : null}
        </View>

        {readiness.kind === 'too_short' ? (
          <InlineNotice tone="warning" title="Too short to save" message="Activities need at least 30 seconds of moving time. Resume to keep going or discard it." />
        ) : null}
        {readiness.kind === 'no_route' ? (
          <InlineNotice
            tone="warning"
            icon="crosshairs-off"
            title="No GPS route was recorded"
            message="The signal was too weak or location was unavailable. You can still save the time and enter the distance yourself; it will be marked as manually logged."
          />
        ) : null}
        {isGps && livePoints.length > 1 ? <RouteMap points={livePoints.map((p) => ({ lat: p.lat, lng: p.lng, segment: p.seg }))} height={200} /> : null}

        {readiness.kind !== 'too_short' ? (
          <View style={{ gap: spacing.lg }}>
            {needsDistance ? (
              <TextField
                label={`Distance (${units.unit})`}
                value={distanceText}
                onChangeText={setDistanceText}
                keyboardType="decimal-pad"
                placeholder="e.g. 5.0"
                suffix={units.unit}
                hint="Leave empty if you did not cover a distance."
              />
            ) : null}
            <TextField label="Title" value={title} onChangeText={setTitle} placeholder={`e.g. Morning ${meta.label}`} maxLength={100} />
            <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="How did it feel?" />
            <View style={{ gap: spacing.sm }}>
              <Text variant="smallStrong" tone="muted">
                Who can see this activity
              </Text>
              <VisibilityPicker value={effectiveVisibility} onChange={setVisibility} />
            </View>
            {error ? <InlineNotice tone="danger" title={error} /> : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.controls, { padding: spacing.lg, gap: spacing.md, borderTopColor: colors.border }]}>
        {readiness.kind !== 'too_short' ? (
          <Button label="Save activity" icon="check" size="lg" loading={saving} onPress={() => void save()} style={{ flex: 1 }} testID="save-activity" />
        ) : null}
        <Button label="Resume" icon="play" size="lg" variant="secondary" disabled={saving} onPress={() => useRecording.getState().unfinish()} style={readiness.kind === 'too_short' ? { flex: 1 } : undefined} />
        <IconButton icon="delete-outline" accessibilityLabel="Discard recording" variant="filled" color={colors.danger} onPress={onDiscard} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  metrics: { flexDirection: 'row', gap: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
});
