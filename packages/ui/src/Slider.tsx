import React, { useState } from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { useTheme, elevation } from './theme';

export type SliderProps = {
  value: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Cross-platform slider built on the Responder system (no native module).
 * Works with touch on iOS/Android and mouse/touch on web via react-native-web.
 */
export function Slider({
  value, onChange, min = 0, max = 100, step = 1, disabled, showValue, label, style,
}: SliderProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const THUMB = 24;
  const range = max - min || 1;
  const pct = clamp((value - min) / range, 0, 1);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const update = (e: GestureResponderEvent) => {
    if (disabled || width <= 0) return;
    const x = clamp(e.nativeEvent.locationX, 0, width);
    let v = min + (x / width) * range;
    if (step > 0) v = Math.round(v / step) * step;
    v = clamp(v, min, max);
    onChange?.(v);
  };

  return (
    <View style={style as ViewStyle}>
      {(label || showValue) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          {label ? <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 13, color: t.colors.textMuted }}>{label}</Text> : <View />}
          {showValue ? <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 14, color: t.colors.primary }}>{Math.round(value)}</Text> : null}
        </View>
      ) : null}

      <View
        onLayout={onLayout}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={update}
        onResponderMove={update}
        // hit slop area
        style={{ height: THUMB + 12, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      >
        {/* track */}
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.mode === 'dark' ? 'rgba(255,255,255,0.14)' : '#E2DED6' }} />
        {/* fill */}
        <View style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, width: Math.max(6, pct * width), backgroundColor: t.colors.primary }} />
        {/* thumb */}
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: t.colors.primary,
              left: clamp(pct * width - THUMB / 2, 0, Math.max(0, width - THUMB)),
            },
            elevation(2),
          ]}
        />
      </View>
    </View>
  );
}
