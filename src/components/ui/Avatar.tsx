import { Image } from 'expo-image';
import { View } from 'react-native';

import { mix } from '@/theme/color';
import { useAppTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  ring?: string;
  level?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_HUES = ['#1FC99A', '#4FB7FF', '#FF7A45', '#9B7BFF', '#F5C451', '#FF8FA3', '#3CC6D9', '#7CCB4E'];

function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function Avatar({ name, uri, size = 44, ring, level }: AvatarProps) {
  const { colors } = useAppTheme();
  const hue = hueFor(name);
  const ringWidth = ring ? Math.max(2, Math.round(size / 18)) : 0;
  return (
    <View accessibilityLabel={`${name}${level ? `, level ${level}` : ''}`} accessibilityRole="image" style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ring ?? 'transparent',
          overflow: 'hidden',
          backgroundColor: mix(hue, colors.background, 0.55),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: size * 0.38, lineHeight: size * 0.46 }} variant="bodyStrong">
            {initials(name)}
          </Text>
        )}
      </View>
      {level ? (
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            minWidth: Math.max(20, size * 0.36),
            height: Math.max(20, size * 0.36),
            borderRadius: 999,
            paddingHorizontal: 4,
            backgroundColor: colors.secondary,
            borderWidth: 2,
            borderColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="caption" style={{ color: '#1A1300', fontSize: Math.max(10, size * 0.2), lineHeight: Math.max(12, size * 0.24) }}>
            {level}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
