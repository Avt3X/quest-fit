import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Narrows an icon name coming from the database; unknown names fall back safely. */
export function toIconName(value: string | null | undefined, fallback: IconName = 'star-four-points'): IconName {
  return value && value in MaterialCommunityIcons.glyphMap ? (value as IconName) : fallback;
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color, style, accessibilityLabel }: IconProps) {
  const { colors } = useAppTheme();
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color ?? colors.text}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}
