import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme, elevation } from './theme';

export type CardProps = {
  children: React.ReactNode;
  padded?: boolean;
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Surface container: brand card background, hairline border, rounded corners. */
export function Card({ children, padded = true, raised, style }: CardProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: padded ? t.spacing.xxl : 0,
        },
        raised ? elevation(2) : null,
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}
