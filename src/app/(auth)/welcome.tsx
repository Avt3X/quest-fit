import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/brand/Hero';
import { Button, Icon, type IconName, MAX_CONTENT_WIDTH, Text } from '@/components/ui';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { JourneyArt } from '@/features/journeys/JourneyArt';
import { useAppTheme } from '@/theme/ThemeProvider';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'map-marker-path', title: 'Record every step', body: 'GPS runs, rides, walks and hikes, or log anything manually.' },
  { icon: 'flag-checkered', title: 'Challenge your crew', body: 'Solo goals, head-to-head duels, team battles and community quests.' },
  { icon: 'compass-rose', title: 'Travel epic journeys', body: 'Your real kilometres move you across the Alps, Japan, Georgia and beyond.' },
  { icon: 'palette-swatch-variant', title: 'Unlock new worlds', body: 'Milestones unlock badges, levels and themes that reshape the app.' },
];

export default function WelcomeScreen() {
  const { colors, spacing, radii } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.hero}>
        <JourneyArt artKey="ashen" id="welcome" />
        <SafeAreaView edges={['top']} style={{ padding: spacing.xl, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <LogoMark size={40} />
            <Text variant="title" style={{ color: '#FFFFFF' }}>
              QuestFit
            </Text>
          </View>
        </SafeAreaView>
      </View>
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, padding: spacing.xl }]}>
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: spacing.lg, flex: 1 }}>
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text variant="display">Every workout is a step on an epic journey.</Text>
          </Animated.View>
          <View style={{ gap: spacing.md }}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.title} entering={FadeInDown.delay(120 + i * 80).duration(400)} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <View style={{ width: 36, height: 36, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={f.icon} size={20} color={colors.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{f.title}</Text>
                  <Text variant="small" tone="muted">
                    {f.body}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ gap: spacing.sm }}>
            <Button label="Start your quest" size="lg" iconRight="arrow-right" onPress={() => router.push('/sign-up')} fullWidth />
            <Button label="I already have an account" variant="ghost" onPress={() => router.push('/sign-in')} fullWidth />
            <SocialButtons />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260 },
  sheet: { flex: 1, marginTop: -28 },
});
