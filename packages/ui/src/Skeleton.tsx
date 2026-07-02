import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme, radii as radiiScale } from './theme';
import { useReducedMotion } from './motion';

export type SkeletonProps = {
  /** 'line' — a text-height bar; 'block' — a rectangle; 'circle' — a disc. */
  variant?: 'line' | 'block' | 'circle';
  width?: number | string;
  height?: number;
  /** radii token key (sm/md/lg/xl/pill) or an explicit number. Circles ignore this. */
  radius?: keyof typeof radiiScale | number;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_HEIGHTS = { line: 14, block: 72, circle: 40 } as const;

/**
 * Loading placeholder. Pulses its opacity while content is loading; renders
 * static under OS reduced-motion. Colors are non-brand overlay tints derived
 * from the active scheme.
 *
 *   <Skeleton variant="line" width="60%" />
 *   <Skeleton variant="block" height={96} radius="md" />
 *   <Skeleton variant="circle" height={44} />
 */
export function Skeleton({ variant = 'line', width, height, radius, style }: SkeletonProps) {
  const t = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 450, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  const h = height ?? DEFAULT_HEIGHTS[variant];
  const w = width ?? (variant === 'circle' ? h : '100%');
  const r =
    variant === 'circle'
      ? h / 2
      : typeof radius === 'number'
        ? radius
        : radius
          ? radiiScale[radius]
          : variant === 'line'
            ? radiiScale.sm - 2
            : radiiScale.md;

  // Non-brand overlay tint (allowed outside the token files).
  const tint = t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(26,29,34,0.08)';

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={style as ViewStyle}>
      <Animated.View
        style={{
          width: w as ViewStyle['width'],
          height: h,
          borderRadius: r,
          backgroundColor: tint,
          opacity: reducedMotion ? 1 : opacity,
        }}
      />
    </View>
  );
}
