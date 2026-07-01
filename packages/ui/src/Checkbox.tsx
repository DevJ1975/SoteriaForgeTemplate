import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';
import { Check } from './icons';

export type CheckboxProps = {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Checkbox({ checked, onChange, label, disabled, style }: CheckboxProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 11, opacity: disabled ? 0.5 : 1 }, style as ViewStyle]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? t.colors.primary : 'transparent',
          borderWidth: checked ? 0 : 2,
          borderColor: t.colors.border,
        }}
      >
        {checked ? <Check size={16} color={t.colors.onPrimary} /> : null}
      </View>
      {label ? <Text style={{ fontFamily: t.fonts.body, fontSize: 15, color: t.colors.text }}>{label}</Text> : null}
    </Pressable>
  );
}
