import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';

export type SectionHeadingProps = { index?: string | number; title: string; style?: any };

/** Numbered section heading used across report documents. */
export function SectionHeading({ index, title, style }: SectionHeadingProps) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }, style]}>
      {index != null ? (
        <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 15, color: t.colors.primary }}>
          {typeof index === 'number' ? String(index).padStart(2, '0') : index}
        </Text>
      ) : null}
      <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 22, color: t.colors.text }}>{title}</Text>
    </View>
  );
}
