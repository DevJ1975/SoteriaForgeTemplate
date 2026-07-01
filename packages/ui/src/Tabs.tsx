import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTheme } from './theme';

export type TabItem = { label: string; value: string };
export type TabsProps = {
  value: string;
  onChange?: (value: string) => void;
  items: TabItem[];
  scrollable?: boolean;
  style?: any;
};

/** Underline tab bar. Controlled via value/onChange. */
export function Tabs({ value, onChange, items, scrollable, style }: TabsProps) {
  const t = useTheme();
  const row = (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(it.value)}
            style={{ paddingVertical: 12, paddingHorizontal: 16, marginRight: 6, borderBottomWidth: 2, borderBottomColor: active ? t.colors.primary : 'transparent', marginBottom: -1 }}
          >
            <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 15, letterSpacing: 0.2, color: active ? t.colors.primary : t.colors.textMuted }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ flexDirection: 'row' }}>
        {row}
      </ScrollView>
    );
  }
  return <View style={style}>{row}</View>;
}
