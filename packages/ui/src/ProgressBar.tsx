import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';
import { useReducedMotion } from './motion';

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  /** Animate the fill toward `value` (default true). Ignored under OS reduced-motion. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function ProgressBar({ value, height = 8, trackColor, fillColor, animated = true, style }: ProgressBarProps) {
  const t = useTheme();
  const reducedMotion = useReducedMotion();
  const pct = clamp(value, 0, 1);
  // Width animation interpolates a percentage string, so it stays on the JS driver.
  const anim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    if (!animated || reducedMotion) {
      anim.setValue(pct);
      return;
    }
    const timing = Animated.timing(anim, { toValue: pct, duration: 450, useNativeDriver: false });
    timing.start();
    return () => timing.stop();
  }, [anim, pct, animated, reducedMotion]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}
      style={[
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? (t.mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#E2DED6'), overflow: 'hidden' },
        style as ViewStyle,
      ]}
    >
      <Animated.View style={{ height: '100%', width, borderRadius: height / 2, backgroundColor: fillColor ?? t.colors.primary }} />
    </View>
  );
}
