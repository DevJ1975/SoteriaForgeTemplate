import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle, Ellipse, Path, Polygon, G } from 'react-native-svg';
import { useTheme } from './theme';
import { BadgeGlyph, BadgeGlyphName } from './badgeIcons';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'ember' | 'platinum';
export type BadgeShape = 'rosette' | 'shield' | 'hexagon' | 'circle';

export type AchievementBadgeProps = {
  icon?: BadgeGlyphName;
  tier?: BadgeTier;
  shape?: BadgeShape;
  size?: number;
  label?: string;
  sublabel?: string;
  locked?: boolean;
  /** override the centred glyph entirely */
  renderIcon?: (size: number, color: string) => React.ReactNode;
  style?: any;
};

type Palette = { faceA: string; faceB: string; ring: string; rim: string; glyph: string };

const TIERS: Record<BadgeTier | 'locked', Palette> = {
  bronze:   { faceA: '#F6C89E', faceB: '#C87B44', ring: '#A85B27', rim: '#7C3F19', glyph: '#5A2E12' },
  silver:   { faceA: '#FBFDFF', faceB: '#B9C3CF', ring: '#94A0AE', rim: '#6E7B8A', glyph: '#3D4650' },
  gold:     { faceA: '#FFF1BC', faceB: '#EDB23C', ring: '#CC8B1D', rim: '#9E6A12', glyph: '#6E4A0E' },
  ember:    { faceA: '#FFD3A3', faceB: '#E8551F', ring: '#C0401A', rim: '#8A2C0D', glyph: '#FFFFFF' },
  platinum: { faceA: '#EFF4F9', faceB: '#A6B6C6', ring: '#768899', rim: '#516170', glyph: '#33404D' },
  locked:   { faceA: '#DADADA', faceB: '#ABABAB', ring: '#9A9A9A', rim: '#7C7C7C', glyph: '#6C6C6C' },
};

let _uid = 0;

const SHIELD = 'M50,8 L84,20 V48 C84,71 70,87 50,94 C30,87 16,71 16,48 V20 Z';

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function AchievementBadge({
  icon = 'star', tier = 'ember', shape = 'rosette', size = 96,
  label, sublabel, locked, renderIcon, style,
}: AchievementBadgeProps) {
  const t = useTheme();
  const id = React.useMemo(() => ++_uid, []);
  const pal = locked ? TIERS.locked : TIERS[tier];
  const gFace = `abFace${id}`;
  const gRing = `abRing${id}`;

  // rosette scallop petals
  const petals: React.ReactNode[] = [];
  if (shape === 'rosette') {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N;
      petals.push(<Circle key={i} cx={50 + 40 * Math.cos(a)} cy={50 + 40 * Math.sin(a)} r={7.5} fill={pal.rim} />);
    }
  }

  const ringBand = (() => {
    switch (shape) {
      case 'shield':
        return <><Path d={SHIELD} fill={`url(#${gRing})`} /><Path d={SHIELD} fill="none" stroke={pal.rim} strokeWidth={2} /></>;
      case 'hexagon':
        return <><Polygon points={hexPoints(50, 50, 44)} fill={`url(#${gRing})`} /><Polygon points={hexPoints(50, 50, 44)} fill="none" stroke={pal.rim} strokeWidth={2} /></>;
      default: // rosette + circle
        return <><Circle cx="50" cy="50" r="42" fill={`url(#${gRing})`} /><Circle cx="50" cy="50" r="42" fill="none" stroke={pal.rim} strokeWidth={1.5} /></>;
    }
  })();

  const faceInner = (() => {
    switch (shape) {
      case 'shield':
        return <Path d="M50,17 L76,26 V47 C76,64 65,77 50,83 C35,77 24,64 24,47 V26 Z" fill={`url(#${gFace})`} />;
      case 'hexagon':
        return <Polygon points={hexPoints(50, 50, 33)} fill={`url(#${gFace})`} />;
      default:
        return <Circle cx="50" cy="50" r="33" fill={`url(#${gFace})`} />;
    }
  })();

  const glyphColor = pal.glyph;
  const glyphSize = size * (shape === 'shield' ? 0.34 : 0.38);

  const medallion = (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gFace} cx="50%" cy="36%" r="62%">
            <Stop offset="0" stopColor={pal.faceA} />
            <Stop offset="1" stopColor={pal.faceB} />
          </RadialGradient>
          <LinearGradient id={gRing} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={pal.faceA} stopOpacity={0.9} />
            <Stop offset="0.5" stopColor={pal.ring} />
            <Stop offset="1" stopColor={pal.rim} />
          </LinearGradient>
        </Defs>
        {petals}
        {ringBand}
        {faceInner}
        {/* top sheen */}
        <Ellipse cx="50" cy={shape === 'shield' ? 34 : 38} rx="19" ry="10" fill="#FFFFFF" opacity={locked ? 0.06 : 0.16} />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {renderIcon ? renderIcon(glyphSize, glyphColor) : <BadgeGlyph name={locked ? 'lock' : icon} size={glyphSize} color={glyphColor} strokeWidth={2.1} />}
      </View>
    </View>
  );

  if (!label && !sublabel) {
    return <View style={[{ opacity: locked ? 0.9 : 1 }, style]}>{medallion}</View>;
  }

  return (
    <View style={[{ alignItems: 'center', width: size + 28, opacity: locked ? 0.9 : 1 }, style]}>
      {medallion}
      {label ? (
        <Text numberOfLines={1} style={{ marginTop: 9, fontFamily: t.fonts.display, fontWeight: '700', fontSize: 13.5, letterSpacing: 0.4, textTransform: 'uppercase', color: locked ? t.colors.textMuted : t.colors.text, textAlign: 'center' }}>
          {label}
        </Text>
      ) : null}
      {sublabel ? (
        <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: t.fonts.body, fontSize: 12, color: t.colors.textMuted, textAlign: 'center' }}>
          {sublabel}
        </Text>
      ) : null}
    </View>
  );
}
