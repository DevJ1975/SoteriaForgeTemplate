import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle, Polygon, Path, Text as SvgText, Ellipse } from 'react-native-svg';

export type RankMedalProps = {
  rank: number;
  size?: number;
  /** ribbon colour behind the medal (defaults to brand ember) */
  ribbonColor?: string;
  style?: any;
};

const RANK_PAL: Record<number, { faceA: string; faceB: string; ring: string; rim: string; num: string }> = {
  1: { faceA: '#FFF1BC', faceB: '#EDB23C', ring: '#CC8B1D', rim: '#9E6A12', num: '#6E4A0E' },
  2: { faceA: '#FBFDFF', faceB: '#B9C3CF', ring: '#94A0AE', rim: '#6E7B8A', num: '#3D4650' },
  3: { faceA: '#F6C89E', faceB: '#C87B44', ring: '#A85B27', rim: '#7C3F19', num: '#5A2E12' },
};
const STEEL = { faceA: '#EFF2F5', faceB: '#B7C0CB', ring: '#8592A0', rim: '#606C79', num: '#3D4650' };

let _uid = 0;

/** Circular medal with a ribbon — for leaderboard standings. Rank 1–3 are gold/silver/bronze; 4+ are steel with the number. */
export function RankMedal({ rank, size = 64, ribbonColor = '#E8551F', style }: RankMedalProps) {
  const id = React.useMemo(() => ++_uid, []);
  const pal = RANK_PAL[rank] || STEEL;
  const gFace = `rmFace${id}`;
  const gRib = `rmRib${id}`;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gFace} cx="50%" cy="38%" r="62%">
            <Stop offset="0" stopColor={pal.faceA} />
            <Stop offset="1" stopColor={pal.faceB} />
          </RadialGradient>
          <LinearGradient id={gRib} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={ribbonColor} />
            <Stop offset="1" stopColor="#B23A12" />
          </LinearGradient>
        </Defs>
        {/* ribbon tails */}
        <Polygon points="36,54 24,96 42,88 50,64" fill={`url(#${gRib})`} />
        <Polygon points="64,54 76,96 58,88 50,64" fill={`url(#${gRib})`} />
        <Polygon points="36,54 24,96 31,92 42,60" fill="#000000" opacity={0.12} />
        {/* medal */}
        <Circle cx="50" cy="40" r="31" fill={pal.rim} />
        <Circle cx="50" cy="40" r="29" fill={pal.ring} />
        <Circle cx="50" cy="40" r="25" fill={`url(#${gFace})`} />
        <Ellipse cx="50" cy="30" rx="14" ry="7" fill="#FFFFFF" opacity={0.18} />
        <SvgText x="50" y="40" fontSize="28" fontWeight="700" fill={pal.num} textAnchor="middle" alignmentBaseline="central">
          {String(rank)}
        </SvgText>
      </Svg>
    </View>
  );
}
