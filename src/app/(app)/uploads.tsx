import { View } from 'react-native';

import { Button, Card, EmptyState, Icon, InlineNotice, Screen, ScreenHeader, Text, confirm, toIconName } from '@/components/ui';
import { ACTIVITY_TYPE_META } from '@/domain/activity-types';
import { formatDuration } from '@/domain/units';
import { flushUploads, useUploadQueue } from '@/features/recording/upload-queue';
import { useUnits } from '@/hooks/useUnits';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function UploadsScreen() {
  const { spacing, colors } = useAppTheme();
  const units = useUnits();
  const items = useUploadQueue((s) => s.items);
  const flushing = useUploadQueue((s) => s.flushing);

  return (
    <Screen>
      <ScreenHeader title="Pending uploads" subtitle="Activities saved on this device that have not reached the server yet." />
      {items.length === 0 ? (
        <EmptyState icon="cloud-check-outline" title="Everything is synced" message="All your activities are safely stored on the server." />
      ) : (
        <View style={{ gap: spacing.md }}>
          <InlineNotice tone="info" title="Safe on this device" message="Pending activities upload automatically when you are online. Retrying can never create duplicates." />
          {items.map((item) => (
            <Card key={item.clientId} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name={toIconName(ACTIVITY_TYPE_META[item.type].icon)} size={20} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {item.title ?? ACTIVITY_TYPE_META[item.type].label}
                </Text>
                <Icon name={item.status === 'failed' ? 'alert-circle' : 'cloud-upload-outline'} size={20} color={item.status === 'failed' ? colors.danger : colors.textMuted} />
              </View>
              <Text variant="small" tone="muted">
                {new Date(item.startedAt).toLocaleString()} · {formatDuration(item.movingTimeS)}
                {item.distanceM ? ` · ${units.distance(item.distanceM)}` : ''} · {item.source === 'gps' ? 'GPS' : 'manual'}
              </Text>
              {item.lastError ? (
                <Text variant="small" tone={item.status === 'failed' ? 'danger' : 'warning'}>
                  {item.lastError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Retry"
                  size="sm"
                  variant="outline"
                  loading={flushing}
                  onPress={() => {
                    useUploadQueue.getState().retry(item.clientId);
                    void flushUploads();
                  }}
                />
                <Button
                  label="Delete"
                  size="sm"
                  variant="ghost"
                  onPress={async () => {
                    const ok = await confirm({ title: 'Delete this activity?', message: 'It has not been uploaded, so it will be lost permanently.', confirmLabel: 'Delete', destructive: true });
                    if (ok) await useUploadQueue.getState().remove(item.clientId);
                  }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
