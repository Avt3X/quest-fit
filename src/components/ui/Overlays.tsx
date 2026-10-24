// App-wide confirm dialog and toast host. React Native's Alert has no buttons on web, so a single
// themed implementation is used on every platform.
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { haptics } from '@/lib/haptics';
import { useAppTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
  icon?: IconName;
}

interface OverlayState {
  dialog: DialogRequest | null;
  toasts: ToastItem[];
  show: (d: DialogRequest) => void;
  close: (ok: boolean) => void;
  toast: (t: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

const useOverlays = create<OverlayState>((set, get) => ({
  dialog: null,
  toasts: [],
  show: (dialog) => {
    get().dialog?.resolve(false);
    set({ dialog });
  },
  close: (ok) => {
    get().dialog?.resolve(ok);
    set({ dialog: null });
  },
  toast: (t) => {
    toastId += 1;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id: toastId }] }));
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function confirm(options: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useOverlays.getState().show({ ...options, resolve }));
}

export const toast = {
  success: (message: string) => {
    haptics.success();
    useOverlays.getState().toast({ message, tone: 'success' });
  },
  error: (message: string) => {
    haptics.error();
    useOverlays.getState().toast({ message, tone: 'error' });
  },
  info: (message: string, icon?: IconName) => useOverlays.getState().toast({ message, tone: 'info', icon }),
};

function ToastView({ item }: { item: ToastItem }) {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const dismiss = useOverlays((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 3500);
    return () => clearTimeout(timer);
  }, [dismiss, item.id]);
  const color = item.tone === 'success' ? colors.success : item.tone === 'error' ? colors.danger : colors.accentText;
  const icon: IconName = item.icon ?? (item.tone === 'success' ? 'check-circle' : item.tone === 'error' ? 'alert-circle' : 'information');
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={() => dismiss(item.id)}
        style={[styles.toast, shadows.floating, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md }]}
      >
        <Icon name={icon} size={20} color={color} />
        <Text variant="smallStrong" style={{ flex: 1 }}>
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function OverlayHost() {
  const { colors, radii, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const dialog = useOverlays((s) => s.dialog);
  const toasts = useOverlays((s) => s.toasts);
  const close = useOverlays((s) => s.close);
  return (
    <>
      <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} />
        ))}
      </View>
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => close(false)}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surfaceElevated, borderRadius: radii.xxl, padding: spacing.xxl, gap: spacing.md }]}>
            <Text variant="heading" accessibilityRole="header">
              {dialog?.title}
            </Text>
            {dialog?.message ? (
              <Text variant="body" tone="muted">
                {dialog.message}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label={dialog?.cancelLabel ?? 'Cancel'} variant="secondary" style={{ flex: 1 }} onPress={() => close(false)} />
              <Button
                label={dialog?.confirmLabel ?? 'Confirm'}
                variant={dialog?.destructive ? 'danger' : 'primary'}
                style={{ flex: 1 }}
                onPress={() => close(true)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastHost: { position: 'absolute', left: 16, right: 16, zIndex: 1000, gap: 8, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, width: '100%', maxWidth: 520 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420 },
});
