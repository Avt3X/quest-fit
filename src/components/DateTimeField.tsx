// Cross-platform date (and optional time) picker built from primitives, so it behaves the same on
// iOS, Android and web without native picker modules.
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, IconButton, Text, TextField } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  withTime?: boolean;
  minDate?: Date;
  maxDate?: Date;
  error?: string;
  placeholder?: string;
}

export function DateTimeField({ label, value, onChange, withTime, minDate, maxDate, error, placeholder = 'Select a date' }: DateTimeFieldProps) {
  const { colors, radii, spacing } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = value ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [draft, setDraft] = useState<Date>(value ?? new Date());
  const [time, setTime] = useState(() => (value ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` : '07:00'));
  const [timeError, setTimeError] = useState<string | undefined>();

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  }, [cursor]);

  const display = value
    ? value.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) })
    : placeholder;

  const confirm = () => {
    const result = new Date(draft.getFullYear(), draft.getMonth(), draft.getDate());
    if (withTime) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
        setTimeError('Use 24-hour time, e.g. 07:30');
        return;
      }
      result.setHours(Number(m[1]), Number(m[2]));
    }
    setTimeError(undefined);
    onChange(result);
    setOpen(false);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="smallStrong" tone="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={() => {
          haptics.tap();
          setDraft(value ?? new Date());
          setOpen(true);
        }}
        style={[styles.field, { borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface, borderRadius: radii.lg }]}
      >
        <Icon name="calendar-month-outline" size={20} color={colors.textMuted} />
        <Text variant="body" tone={value ? 'default' : 'subtle'} style={{ flex: 1 }}>
          {display}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.panel, { backgroundColor: colors.surfaceElevated, borderRadius: radii.xxl, padding: spacing.xl, gap: spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton icon="chevron-left" accessibilityLabel="Previous month" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
              <Text variant="heading" align="center" style={{ flex: 1 }}>
                {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </Text>
              <IconButton icon="chevron-right" accessibilityLabel="Next month" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
            </View>
            <View style={styles.grid}>
              {WEEKDAYS.map((d) => (
                <Text key={d} variant="caption" tone="subtle" align="center" style={styles.cell}>
                  {d}
                </Text>
              ))}
              {days.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.cell} />;
                const disabled = (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) || (maxDate && d > maxDate);
                const selected = sameDay(d, draft);
                const today = sameDay(d, new Date());
                return (
                  <Pressable
                    key={d.toISOString()}
                    accessibilityRole="button"
                    accessibilityLabel={d.toDateString()}
                    accessibilityState={{ selected, disabled: !!disabled }}
                    disabled={!!disabled}
                    onPress={() => setDraft(d)}
                    style={[styles.cell, { alignItems: 'center', justifyContent: 'center' }]}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.accent : 'transparent',
                        borderWidth: today && !selected ? 1 : 0,
                        borderColor: colors.accent,
                      }}
                    >
                      <Text variant="smallStrong" style={{ color: selected ? colors.onAccent : disabled ? colors.textSubtle : colors.text, opacity: disabled ? 0.4 : 1 }}>
                        {d.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {withTime ? <TextField label="Start time (24h)" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" error={timeError} maxLength={5} /> : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setOpen(false)} />
              <Button label="Done" style={{ flex: 1 }} onPress={confirm} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderWidth: 1.5, paddingHorizontal: 14 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 400 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42 },
});
