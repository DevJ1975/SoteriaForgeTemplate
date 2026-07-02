import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';

export type StatTileProps = {
  value: string | number;
  label: string;
  /** colour for the value; defaults to brand primary */
  accent?: string;
  style?: any;
};

/** Compact KPI tile — big number over a label. */
export function StatTile({ value, label, accent, style }: StatTileProps) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[{ flex: 1, backgroundColor: t.colors.card, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radii.md, paddingVertical: 16, paddingHorizontal: 16 }, style]}
    >
      <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 30, lineHeight: 30, color: accent ?? t.colors.primary }}>
        {value}
      </Text>
      <Text style={{ fontFamily: t.fonts.body, fontSize: 12, color: t.colors.textMuted, marginTop: 7 }}>{label}</Text>
    </View>
  );
}
