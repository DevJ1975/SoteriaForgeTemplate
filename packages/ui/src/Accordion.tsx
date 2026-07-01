import React, { useState } from 'react';
import { View, Text, Pressable, Platform, UIManager, LayoutAnimation } from 'react-native';
import { useTheme } from './theme';
import { ChevronDown } from './icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type AccordionItem = { title: string; content: React.ReactNode | string };
export type AccordionProps = {
  items: AccordionItem[];
  /** allow multiple panels open at once */
  multiple?: boolean;
  /** indexes open initially */
  defaultOpen?: number[];
  style?: any;
};

export function Accordion({ items, multiple, defaultOpen = [], style }: AccordionProps) {
  const t = useTheme();
  const [open, setOpen] = useState<number[]>(defaultOpen);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const has = prev.includes(i);
      if (has) return prev.filter((x) => x !== i);
      return multiple ? [...prev, i] : [i];
    });
  };

  return (
    <View style={[{ borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radii.md, overflow: 'hidden' }, style]}>
      {items.map((it, i) => {
        const isOpen = open.includes(i);
        return (
          <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.colors.border }}>
            <Pressable
              onPress={() => toggle(i)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: t.colors.surface }}
            >
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 16, color: t.colors.text, flex: 1 }}>{it.title}</Text>
              <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                <ChevronDown size={20} color={t.colors.textMuted} />
              </View>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                {typeof it.content === 'string' ? (
                  <Text style={{ fontFamily: t.fonts.body, fontSize: 14, lineHeight: 20, color: t.colors.textMuted }}>{it.content}</Text>
                ) : (
                  it.content
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
