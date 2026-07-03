import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle, G, Path, Text as SvgText, TextPath, Ellipse } from 'react-native-svg';
import { useTheme } from './theme';
import { Logo } from './Logo';
import { ScaledSurface } from './ReportPage';

export type CertificateProps = {
  recipientName?: string;
  courseName?: string;
  completionDate?: string;
  hours?: string;
  score?: string;
  certId?: string;
  orgTagline?: string;
  signatoryLeftName?: string;
  signatoryLeftTitle?: string;
  signatoryRightName?: string;
  signatoryRightTitle?: string;
  verifyUrl?: string;
  style?: any;
};

/** Gold verification seal — scalloped rosette + circular text + shield centre. */
function Seal({ size = 132 }: { size?: number }) {
  const petals: React.ReactNode[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N - Math.PI / 2;
    petals.push(<Circle key={i} cx={100 + 82 * Math.cos(a)} cy={100 + 82 * Math.sin(a)} r={13} fill="#9E6A12" />);
  }
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id="certSealFace" cx="50%" cy="36%" r="62%">
            <Stop offset="0" stopColor="#FFF1BC" />
            <Stop offset="1" stopColor="#EDB23C" />
          </RadialGradient>
          <LinearGradient id="certSealRing" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF1BC" />
            <Stop offset="0.5" stopColor="#CC8B1D" />
            <Stop offset="1" stopColor="#9E6A12" />
          </LinearGradient>
          <Path id="certSealArc" d="M100,100 m-66,0 a66,66 0 1,1 132,0 a66,66 0 1,1 -132,0" fill="none" />
        </Defs>
        {petals}
        <Circle cx="100" cy="100" r="74" fill="url(#certSealRing)" />
        <Circle cx="100" cy="100" r="74" fill="none" stroke="#8A5A12" strokeWidth={1.5} />
        <Circle cx="100" cy="100" r="56" fill="url(#certSealFace)" />
        <Ellipse cx="100" cy="80" rx="26" ry="12" fill="#FFFFFF" opacity={0.18} />
        <SvgText fill="#6E4A0E" fontFamily="Oswald" fontWeight="600" fontSize="13" letterSpacing="3.2">
          <TextPath href="#certSealArc" startOffset="1%">SOTERIA FORGE · VERIFIED · CERTIFIED · </TextPath>
        </SvgText>
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={size * 0.34} />
      </View>
    </View>
  );
}

/**
 * Certificate — a branded, print-proportioned certificate that scales to fit.
 * All copy is prop-driven so you can render it per learner.
 *
 *   <Certificate recipientName="Monica Lynn Green" courseName="Frontline De-escalation" score="94%" />
 */
export function Certificate({
  recipientName = 'Recipient Name',
  courseName = 'Course or Program Name',
  completionDate = '—',
  hours = '—',
  score = '—',
  certId = 'SF-0000-0000',
  orgTagline = 'SAFETY · COMPLIANCE · TRAINING',
  signatoryLeftName = 'Monica Lynn Green',
  signatoryLeftTitle = 'Program Director · Lynn Agency',
  signatoryRightName = 'Charles Pettis',
  signatoryRightTitle = 'Director, Customer Experience',
  verifyUrl = 'SOTERIAFORGE.APP/VERIFY',
  style,
}: CertificateProps) {
  const t = useTheme();
  const D = t.fonts.display;

  const Meta = ({ k, v }: { k: string; v: string }) => (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 2, color: '#8A8579' }}>{k}</Text>
      <Text style={{ fontFamily: D, fontWeight: '600', fontSize: 19, color: '#1A1D22', marginTop: 4 }}>{v}</Text>
    </View>
  );
  const Sig = ({ name, title }: { name: string; title: string }) => {
    // "Jane Doe" → "J. Doe" (initial of the first name + the last name). Guard
    // the indexed reads: `split` never returns an empty array, but under
    // `noUncheckedIndexedAccess` each element is `string | undefined`.
    const parts = name.split(' ');
    const initial = (parts[0] ?? '').charAt(0);
    const surname = parts[parts.length - 1] ?? '';
    return (
    <View style={{ width: 250, alignItems: 'center' }}>
      <Text style={{ fontFamily: D, fontWeight: '500', fontSize: 22, fontStyle: 'italic', color: '#1A1D22' }}>{initial}. {surname}</Text>
      <View style={{ height: 1.5, alignSelf: 'stretch', backgroundColor: '#1A1D22', marginTop: 4, marginBottom: 7 }} />
      <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 13, color: '#1A1D22' }}>{name}</Text>
      <Text style={{ fontFamily: t.fonts.body, fontSize: 11.5, color: '#8A8579' }}>{title}</Text>
    </View>
    );
  };

  return (
    <ScaledSurface baseWidth={1056} baseHeight={816} style={style}>
      <View style={{ width: 1056, height: 816, backgroundColor: '#F5F2EC' }}>
        {/* ornamental border */}
        <View style={{ position: 'absolute', top: 24, left: 24, right: 24, bottom: 24, borderWidth: 2, borderColor: '#1A1D22' }} />
        <View style={{ position: 'absolute', top: 31, left: 31, right: 31, bottom: 31, borderWidth: 1, borderColor: '#E8551F' }} />
        {/* corner accents */}
        {[{ top: 16, left: 16, bt: 4, bl: 4 }, { top: 16, right: 16, bt: 4, br: 4 }, { bottom: 16, left: 16, bb: 4, bl: 4 }, { bottom: 16, right: 16, bb: 4, br: 4 }].map((c, i) => (
          <View key={i} style={{ position: 'absolute', width: 34, height: 34, top: (c as any).top, left: (c as any).left, right: (c as any).right, bottom: (c as any).bottom, borderTopWidth: (c as any).bt || 0, borderBottomWidth: (c as any).bb || 0, borderLeftWidth: (c as any).bl || 0, borderRightWidth: (c as any).br || 0, borderColor: '#E8551F' }} />
        ))}

        {/* content */}
        <View style={{ position: 'absolute', top: 31, left: 31, right: 31, bottom: 31, paddingHorizontal: 70, paddingTop: 44, paddingBottom: 40, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Logo size={40} />
            <Text style={{ fontFamily: D, fontWeight: '700', fontSize: 24, color: '#1A1D22' }}>SOTERIA<Text style={{ color: '#E8551F' }}> FORGE</Text></Text>
          </View>
          <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 12, letterSpacing: 3, color: '#8A8579', marginTop: 6 }}>{orgTagline}</Text>

          <Text style={{ fontFamily: D, fontWeight: '700', fontSize: 40, letterSpacing: 5, color: '#1A1D22', marginTop: 26 }}>CERTIFICATE OF COMPLETION</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, width: 340 }}>
            <View style={{ height: 1, flex: 1, backgroundColor: '#D8D2C6' }} />
            <Logo size={15} />
            <View style={{ height: 1, flex: 1, backgroundColor: '#D8D2C6' }} />
          </View>

          <Text style={{ fontFamily: t.fonts.body, fontSize: 16, color: '#6A6F76', marginTop: 24 }}>This certifies that</Text>
          <Text style={{ fontFamily: D, fontWeight: '600', fontSize: 56, color: '#1A1D22', marginTop: 10 }}>{recipientName}</Text>
          <View style={{ height: 2, width: 440, backgroundColor: '#E8551F', marginTop: 8, opacity: 0.5 }} />

          <Text style={{ fontFamily: t.fonts.body, fontSize: 16, color: '#6A6F76', marginTop: 22 }}>has successfully completed</Text>
          <Text style={{ fontFamily: D, fontWeight: '600', fontSize: 27, color: '#B4501A', marginTop: 8, textAlign: 'center', maxWidth: 720 }}>{courseName}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 40, marginTop: 26 }}>
            <Meta k="DATE" v={completionDate} />
            <View style={{ width: 1, backgroundColor: '#D8D2C6' }} />
            <Meta k="HOURS" v={hours} />
            <View style={{ width: 1, backgroundColor: '#D8D2C6' }} />
            <Meta k="SCORE" v={score} />
          </View>

          <View style={{ marginTop: 'auto', alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Sig name={signatoryLeftName} title={signatoryLeftTitle} />
            <Seal size={132} />
            <Sig name={signatoryRightName} title={signatoryRightTitle} />
          </View>

          <Text style={{ fontFamily: t.fonts.body, fontSize: 11, letterSpacing: 1.4, color: '#A39C90', marginTop: 16 }}>
            CERTIFICATE ID  <Text style={{ color: '#6A6F76', fontWeight: '600' }}>{certId}</Text>  ·  VERIFY AT {verifyUrl}
          </Text>
        </View>
      </View>
    </ScaledSurface>
  );
}
