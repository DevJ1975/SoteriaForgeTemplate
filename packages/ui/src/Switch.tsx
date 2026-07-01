import React from 'react';
import { View, Text, Switch as RNSwitch, Platform } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type SwitchProps = {
  value: boolean;
  onValueChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Themed toggle. Wraps the platform Switch (native iOS/Android + web) with brand colours. */
export function Switch({ value, onValueChange, label, disabled, style }: SwitchProps) {
  const t = useTheme();
  const trackOff = t.mode === 'dark' ? '#3A4048' : '#D8D2C6';
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }, style as ViewStyle]}>
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: trackOff, true: t.colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : '#F4F2EE') : undefined}
        ios_backgroundColor={trackOff}
        // @ts-ignore web-only prop from react-native-web
        activeThumbColor="#FFFFFF"
      />
      {label ? <Text style={{ fontFamily: t.fonts.body, fontSize: 15, color: t.colors.text }}>{label}</Text> : null}
    </View>
  );
}
