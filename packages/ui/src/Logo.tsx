/**
 * Soteria Forge — the "Forged Shield" mark as a cross-platform SVG component.
 * Requires react-native-svg.
 *
 *   <Logo size={48} />                     // full colour
 *   <Logo size={32} variant="mono" color="#1B1E23" />
 *   <Wordmark size={28} />                 // mark + SOTERIA FORGE (needs Oswald)
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, ClipPath, Path, Rect, Polygon, G } from 'react-native-svg';
import { fonts, palette } from './theme';

let _uid = 0;

export type LogoProps = { size?: number; variant?: 'color' | 'mono'; color?: string };

export function Logo({ size = 48, variant = 'color', color = palette.charcoal }: LogoProps) {
  // unique gradient/clip ids so multiple logos on one screen don't collide
  const id = React.useMemo(() => ++_uid, []);
  const gEmber = `sfEmber${id}`;
  const gFlame = `sfFlame${id}`;
  const clip = `sfClip${id}`;
  const shield = 'M60,12 L100,25 V58 C100,85 83,104 60,112 C37,104 20,85 20,58 V25 Z';

  if (variant === 'mono') {
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Path
          fillRule="evenodd"
          fill={color}
          d="M60,12 L100,25 V58 C100,85 83,104 60,112 C37,104 20,85 20,58 V25 Z M60,40 C59,42 58,44 58,47 C58,54 55,55 54,51 C51,59 43,64 43,74 C43,88 51,98 60,98 C69,98 77,88 77,74 C77,59 64,55 60,40 Z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id={gEmber} x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#F69A3C" />
          <Stop offset="1" stopColor="#D8451A" />
        </LinearGradient>
        <LinearGradient id={gFlame} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE6B0" />
          <Stop offset="1" stopColor="#F8D38A" />
        </LinearGradient>
        <ClipPath id={clip}>
          <Path d={shield} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        <Rect x="0" y="0" width="120" height="120" fill={`url(#${gEmber})`} />
        <Polygon points="60,12 20,25 20,58 60,112" fill="#AE3A14" />
        <Polygon points="60,12 100,25 100,58 60,112" fill="#DC481B" />
        <Polygon points="60,12 100,25 70,33 60,26" fill="#FFC774" opacity={0.85} />
      </G>
      <Path
        d="M60,40 C64,55 77,59 77,74 C77,88 69,98 60,98 C51,98 43,88 43,74 C43,64 51,59 54,51 C55,55 58,54 58,47 C58,44 59,42 60,40 Z"
        fill={`url(#${gFlame})`}
      />
      <Path d="M60,67 C61,74 67,77 67,83 C67,89 64,93 60,93 C56,93 53,89 53,83 C53,77 59,74 60,67 Z" fill="#E8551F" />
      <Path d={shield} fill="none" stroke="#1B1E23" strokeWidth={3} opacity={0.6} />
    </Svg>
  );
}

/** Horizontal lockup: mark + "SOTERIA FORGE". `onDark` swaps to the reversed palette. */
export function Wordmark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.32 }}>
      <Logo size={size * 1.55} />
      <Text style={{ fontFamily: fonts.display, fontWeight: '700', fontSize: size, letterSpacing: 0.3, color: onDark ? '#F4F2EE' : palette.ink }}>
        SOTERIA<Text style={{ color: onDark ? palette.emberHot : palette.ember }}> FORGE</Text>
      </Text>
    </View>
  );
}
