/**
 * Minimal icon set used by the library (built on react-native-svg so it renders
 * identically on iOS, Android and web). Import and use anywhere:
 *   <Check size={18} color="#fff" />
 */
import React from 'react';
import Svg, { Path, Polyline, Line, Circle } from 'react-native-svg';

export type IconProps = { size?: number; color?: string; strokeWidth?: number };

export function Check({ size = 20, color = '#FFFFFF', strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronDown({ size = 20, color = '#1A1D22', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="6 9 12 15 18 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Close({ size = 20, color = '#1A1D22', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function Search({ size = 20, color = '#8A8579', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** House — tab bar "Home". */
export function HomeIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 10.5 12 3l9 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 9.5V21h5v-6h4v6h5V9.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Open book — tab bar "Courses". */
export function CoursesIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 6.5C10.4 5 8.2 4.2 5.6 4.2c-1 0-1.9.12-2.6.33V19c.7-.2 1.6-.33 2.6-.33 2.6 0 4.8.83 6.4 2.33 1.6-1.5 3.8-2.33 6.4-2.33 1 0 1.9.12 2.6.33V4.53c-.7-.2-1.6-.33-2.6-.33-2.6 0-4.8.83-6.4 2.3Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="6.5" x2="12" y2="21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Faceted diamond/gem — tab bar "Showcase". */
export function ShowcaseIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 3h10l4 6-9 12L3 9l4-6Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 9h18M9.5 9 12 3l2.5 6M9.5 9l2.5 12 2.5-12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Rosette medal — awards / certificates. */
export function AwardIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="9" r="6" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.6 13.9 7 21l5-2.6L17 21l-1.6-7.1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Sun — light appearance. */
export function SunIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="4.2" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Crescent moon — dark appearance. */
export function MoonIcon({ size = 20, color = '#1A1D22', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
