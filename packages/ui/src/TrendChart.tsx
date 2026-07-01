import React, { useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line } from 'react-native-svg';
import { useTheme } from './theme';

export type TrendChartProps = {
  data: number[];
  height?: number;
  labels?: string[];
  color?: string;
  /** number of horizontal grid lines */
  gridLines?: number;
  style?: any;
};

let _uid = 0;

/** Area + line trend chart (react-native-svg). Scales to its container width. */
export function TrendChart({ data, height = 180, labels, color, gridLines = 3, style }: TrendChartProps) {
  const t = useTheme();
  const id = React.useMemo(() => ++_uid, []);
  const [w, setW] = useState(0);
  const stroke = color ?? t.colors.primary;
  const H = height;
  const pad = 6;

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * w : 0,
    y: pad + (1 - (v - min) / range) * (H - 2 * pad),
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = w > 0 ? `${line} L${w},${H} L0,${H} Z` : '';
  const last = pts[pts.length - 1];

  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ height: H }}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id={`tc${id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {Array.from({ length: gridLines }).map((_, i) => {
              const y = ((i + 1) / (gridLines + 1)) * H;
              return <Line key={i} x1={0} y1={y} x2={w} y2={y} stroke={t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'} strokeWidth={1} />;
            })}
            <Path d={area} fill={`url(#tc${id})`} />
            <Path d={line} fill="none" stroke={stroke} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {last ? <Circle cx={last.x} cy={last.y} r={5} fill={stroke} /> : null}
          </Svg>
        ) : null}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 0.6, color: t.colors.textMuted }}>{l}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
