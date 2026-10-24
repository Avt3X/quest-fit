import { View } from 'react-native';

import { SegmentedControl, Text, toIconName } from '@/components/ui';
import { VISIBILITY_META, type Visibility } from '@/domain/activity-types';
import { useAppTheme } from '@/theme/ThemeProvider';

const PROFILE_DESCRIPTIONS: Record<Visibility, string> = {
  public: 'Anyone on QuestFit can see your stats, achievements and public activities.',
  friends: 'Only friends can see your stats, achievements and activities.',
  private: 'Nobody else can see your stats or activities. You are hidden from search.',
};

export function VisibilityPicker({ value, onChange, kind = 'activity' }: { value: Visibility; onChange: (v: Visibility) => void; kind?: 'activity' | 'profile' }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <SegmentedControl
        options={(['public', 'friends', 'private'] as const).map((v) => ({ value: v, label: VISIBILITY_META[v].label, icon: toIconName(VISIBILITY_META[v].icon) }))}
        value={value}
        onChange={onChange}
        accessibilityLabel="Visibility"
      />
      <Text variant="small" tone="muted">
        {kind === 'profile' ? PROFILE_DESCRIPTIONS[value] : VISIBILITY_META[value].description}
      </Text>
    </View>
  );
}
