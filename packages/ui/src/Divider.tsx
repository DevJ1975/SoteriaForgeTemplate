import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type DividerProps = { spacing?: number; style?: StyleProp<ViewStyle> };

export function Divider({ spacing = 0, style }: DividerProps) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.colors.border, marginVertical: spacing }, style as ViewStyle]} />;
}
