import React from 'react';
import { Text, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leftIcon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Selectable pill / filter chip. */
export function Chip({ label, selected, onPress, leftIcon, disabled, style }: ChipProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: t.radii.pill,
          borderWidth: 1.5,
          borderColor: selected ? t.colors.primary : t.colors.border,
          backgroundColor: selected
            ? (t.mode === 'dark' ? 'rgba(255,122,61,0.16)' : 'rgba(232,85,31,0.10)')
            : (pressed ? (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent'),
          opacity: disabled ? 0.5 : 1,
        },
        style as ViewStyle,
      ]}
    >
      {leftIcon}
      <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 14, color: selected ? t.colors.primary : t.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
