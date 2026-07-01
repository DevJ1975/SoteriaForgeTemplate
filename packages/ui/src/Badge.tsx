import React from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type BadgeTone = 'primary' | 'neutral' | 'success' | 'danger' | 'warning' | 'info';
export type BadgeProps = { label: string; tone?: BadgeTone; solid?: boolean; style?: StyleProp<ViewStyle> };

export function Badge({ label, tone = 'primary', solid, style }: BadgeProps) {
  const t = useTheme();
  const base: Record<BadgeTone, string> = {
    primary: t.colors.primary,
    neutral: t.colors.textMuted,
    success: t.colors.success,
    danger: t.colors.danger,
    warning: t.colors.warning,
    info: t.colors.info,
  };
  const c = base[tone];
  const hexToRgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  };
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: t.radii.pill,
          backgroundColor: solid ? c : hexToRgba(c, t.mode === 'dark' ? 0.22 : 0.14),
        },
        style as ViewStyle,
      ]}
    >
      <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: solid ? '#FFFFFF' : c }}>
        {label}
      </Text>
    </View>
  );
}
