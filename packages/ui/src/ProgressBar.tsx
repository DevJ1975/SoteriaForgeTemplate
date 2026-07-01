import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function ProgressBar({ value, height = 8, trackColor, fillColor, style }: ProgressBarProps) {
  const t = useTheme();
  const pct = clamp(value, 0, 1);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}
      style={[
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? (t.mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#E2DED6'), overflow: 'hidden' },
        style as ViewStyle,
      ]}
    >
      <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: height / 2, backgroundColor: fillColor ?? t.colors.primary }} />
    </View>
  );
}
