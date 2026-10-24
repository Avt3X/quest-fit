import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Button, Card, Icon, InlineNotice, Screen, ScreenHeader, SwitchRow, Text, toIconName } from '@/components/ui';
import { ACTIVITY_TYPE_META, type ActivityType, isGpsCapable } from '@/domain/activity-types';
import { requestBackgroundPermission, requestForegroundPermission } from '@/features/recording/location-service';
import { useRecording } from '@/features/recording/recording-store';
import { useLocationReadiness } from '@/features/recording/useLocationReadiness';
import { haptics } from '@/lib/haptics';
import { usePreferences } from '@/state/preferences-store';
import { useAppTheme } from '@/theme/ThemeProvider';

const OUTDOOR: ActivityType[] = ['run', 'walk', 'ride', 'hike'];
const INDOOR: ActivityType[] = ['indoor_run', 'workout', 'swim', 'other'];

function TypeTile({ type, selected, onPress }: { type: ActivityType; selected: boolean; onPress: () => void }) {
  const { colors, radii, spacing } = useAppTheme();
  const meta = ACTIVITY_TYPE_META[type];
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={meta.label}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={{
        flexBasis: '23%',
        flexGrow: 1,
        minWidth: 74,
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 2,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
      }}
    >
      <Icon name={toIconName(meta.icon)} size={28} color={selected ? colors.accentText : colors.text} />
      <Text variant="smallStrong" align="center" numberOfLines={1}>
        {meta.label}
      </Text>
    </Pressable>
  );
}

export default function RecordHubScreen() {
  const { spacing, colors } = useAppTheme();
  const session = useRecording((s) => s.session);
  const [type, setType] = useState<ActivityType>('run');
  const { readiness, refresh } = useLocationReadiness();
  const backgroundTracking = usePreferences((s) => s.backgroundTracking);
  const setBackgroundTracking = usePreferences((s) => s.setBackgroundTracking);
  const [explainBackground, setExplainBackground] = useState(false);

  const gps = isGpsCapable(type);
  const fgGranted = readiness?.foreground === 'granted';
  const fgDenied = readiness?.foreground === 'denied';
  const servicesOff = readiness ? !readiness.servicesEnabled : false;
  const bgGranted = readiness?.background === 'granted';

  const start = async (useGps: boolean) => {
    if (useGps && !fgGranted) {
      const result = await requestForegroundPermission();
      refresh();
      if (result !== 'granted') return;
    }
    router.push({ pathname: '/record/live', params: { type, gps: useGps ? '1' : '0' } });
  };

  if (session) {
    return (
      <Screen>
        <ScreenHeader title="Record" back={false} />
        <Card tone="accent" style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <Icon name="record-rec" size={32} color={colors.danger} />
          <Text variant="heading">A recording is in progress</Text>
          <Text variant="body" tone="muted">
            Finish or discard your current {ACTIVITY_TYPE_META[session.type].label.toLowerCase()} before starting another.
          </Text>
          <Button label="Open recorder" icon="arrow-right" onPress={() => router.push('/record/live')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="record-hub">
      <ScreenHeader title="Record" subtitle="Choose what you are doing." back={false} />
      <Text variant="overline" tone="muted" style={{ marginTop: spacing.md }}>
        Outdoor · GPS
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
        {OUTDOOR.map((t) => (
          <TypeTile key={t} type={t} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <Text variant="overline" tone="muted" style={{ marginTop: spacing.lg }}>
        Indoor & other · timer
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
        {INDOOR.map((t) => (
          <TypeTile key={t} type={t} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        {gps && servicesOff ? (
          <InlineNotice
            tone="warning"
            icon="crosshairs-off"
            title="Location services are off"
            message="Turn on location services in your device settings to record a GPS route."
            action={Platform.OS !== 'web' ? <Button label="Open settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} /> : undefined}
          />
        ) : null}
        {gps && fgDenied ? (
          <InlineNotice
            tone="warning"
            icon="map-marker-off"
            title="Location access is off for QuestFit"
            message="Allow location in Settings to record your route, or record this session with the timer only and enter the distance yourself."
            action={
              <>
                {Platform.OS !== 'web' ? <Button label="Open settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} /> : null}
                <Button label="Use timer only" size="sm" variant="ghost" onPress={() => void start(false)} />
              </>
            }
          />
        ) : null}
        {gps && !fgGranted && !fgDenied ? (
          <Card tone="muted" style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <Icon name="map-marker-radius" size={22} color={colors.accentText} />
              <Text variant="bodyStrong">Why QuestFit asks for location</Text>
            </View>
            <Text variant="small" tone="muted">
              GPS measures your distance, pace and route while you record. Location is never used when you are not recording, and you control who sees your routes.
            </Text>
          </Card>
        ) : null}

        {gps && readiness?.backgroundSupported ? (
          <Card style={{ gap: spacing.sm }}>
            <SwitchRow
              title="Keep recording with the screen off"
              subtitle={bgGranted ? 'Background location is allowed.' : 'Needs “Always” / “Allow all the time” location access.'}
              icon="cellphone-lock"
              value={backgroundTracking && bgGranted}
              onValueChange={(v) => {
                if (!v) return setBackgroundTracking(false);
                if (bgGranted) return setBackgroundTracking(true);
                setExplainBackground(true);
              }}
            />
            {explainBackground && !bgGranted ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="small" tone="muted">
                  {Platform.OS === 'ios'
                    ? 'iOS will ask whether QuestFit may use your location “Always”. We only use it while a recording is running; a blue indicator shows when it is active.'
                    : 'Android will ask for “Allow all the time”. While recording, a notification shows that QuestFit is tracking your route.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button
                    label="Continue"
                    size="sm"
                    onPress={async () => {
                      if (!fgGranted) await requestForegroundPermission();
                      const r = await requestBackgroundPermission();
                      setExplainBackground(false);
                      setBackgroundTracking(r === 'granted');
                      refresh();
                    }}
                  />
                  <Button label="Not now" size="sm" variant="ghost" onPress={() => setExplainBackground(false)} />
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}
        {gps && Platform.OS === 'web' ? (
          <InlineNotice tone="info" title="Web recording is foreground-only" message="Keep this tab open while recording. Use the mobile app for screen-off tracking." />
        ) : null}
      </View>

      <Button
        label={gps ? `Start ${ACTIVITY_TYPE_META[type].label.toLowerCase()}` : `Start ${ACTIVITY_TYPE_META[type].label.toLowerCase()} timer`}
        icon={gps ? 'play' : 'timer-outline'}
        size="lg"
        haptic="medium"
        disabled={gps && servicesOff}
        onPress={() => void start(gps && !fgDenied)}
        style={{ marginTop: spacing.xl }}
        fullWidth
        testID="start-recording"
      />
      <Button label="Log a past activity" icon="pencil-plus-outline" variant="outline" onPress={() => router.push({ pathname: '/record/manual', params: { type } })} style={{ marginTop: spacing.md }} fullWidth />
    </Screen>
  );
}
