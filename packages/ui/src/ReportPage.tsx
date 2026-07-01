import React, { useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import { useTheme } from './theme';
import { Logo } from './Logo';

/**
 * ScaledSurface — renders children at a fixed base size, then scales the whole
 * thing to fit its container width (keeping the page's exact proportions and
 * internal layout). This is what makes a "paper page" reflow-free on any screen.
 *
 * Uses `transformOrigin` (React Native 0.74+ and react-native-web). On older RN
 * it falls back to centre-scaling, which still looks correct, just centred.
 */
export function ScaledSurface({
  baseWidth, baseHeight, children, style,
}: { baseWidth: number; baseHeight: number; children: React.ReactNode; style?: any }) {
  const [w, setW] = useState(0);
  const s = w > 0 ? w / baseWidth : 0;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View onLayout={onLayout} style={[{ width: '100%', height: s > 0 ? baseHeight * s : undefined, overflow: 'hidden' }, style]}>
      {s > 0 ? (
        <View style={{ position: 'absolute', top: 0, left: 0, width: baseWidth, height: baseHeight, transform: [{ scale: s }], transformOrigin: 'top left' } as any}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export type ReportPageProps = {
  children: React.ReactNode;
  orientation?: 'portrait' | 'landscape';
  /** Letter @96dpi by default (816×1056). Override for other stock. */
  baseWidth?: number;
  baseHeight?: number;
  /** running header title (right side); brand lockup sits on the left */
  headerTitle?: string;
  footerLeft?: string;
  pageNumber?: string | number;
  /** paper colour; defaults to brand paper */
  background?: string;
  padded?: boolean;
  style?: any;
};

/**
 * ReportPage — a fixed-size "paper" page (with optional running header/footer)
 * that scales to fit. Stack several in a ScrollView for a paginated document.
 */
export function ReportPage({
  children, orientation = 'portrait', baseWidth, baseHeight,
  headerTitle, footerLeft = 'SOTERIA FORGE · CONFIDENTIAL', pageNumber, background, padded = true, style,
}: ReportPageProps) {
  const t = useTheme();
  const W = baseWidth ?? (orientation === 'landscape' ? 1056 : 816);
  const H = baseHeight ?? (orientation === 'landscape' ? 816 : 1056);
  const hasHeader = !!headerTitle;

  return (
    <ScaledSurface baseWidth={W} baseHeight={H} style={style}>
      <View style={{ width: W, height: H, backgroundColor: background ?? t.colors.bg }}>
        {hasHeader ? (
          <View style={{ height: 60, paddingHorizontal: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: t.colors.border, backgroundColor: t.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Logo size={22} />
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 14, color: t.colors.text }}>
                SOTERIA<Text style={{ color: t.colors.primary }}> FORGE</Text>
              </Text>
            </View>
            <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 1.8, color: t.colors.placeholder }}>{headerTitle}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1, paddingHorizontal: padded ? 54 : 0, paddingVertical: padded ? 34 : 0 }}>
          {children}
        </View>

        {(footerLeft || pageNumber != null) ? (
          <View style={{ height: 52, paddingHorizontal: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.colors.border, backgroundColor: t.colors.surface }}>
            <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 1.6, color: t.colors.placeholder }}>{footerLeft}</Text>
            {pageNumber != null ? (
              <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 1.6, color: t.colors.placeholder }}>
                {typeof pageNumber === 'number' ? `PAGE ${String(pageNumber).padStart(2, '0')}` : pageNumber}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScaledSurface>
  );
}
