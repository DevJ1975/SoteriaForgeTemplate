import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme, elevation } from './theme';
import { ChevronDown, Check } from './icons';

export type SelectOption = { label: string; value: string };

export type SelectProps = {
  label?: string;
  value?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dropdown / select. Uses a Modal overlay so it behaves identically on
 * iOS, Android and web (react-native-web) without any native picker deps.
 */
export function Select({ label, value, options, onChange, placeholder = 'Select…', disabled, style }: SelectProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[{ gap: 6 }, style as ViewStyle]}>
      {label ? (
        <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 13, letterSpacing: 0.2, color: t.colors.textMuted }}>
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1.5,
          borderColor: open ? t.colors.primary : t.colors.border,
          backgroundColor: t.colors.inputBg,
          borderRadius: t.radii.sm + 2,
          paddingHorizontal: 14,
          minHeight: 48,
          opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: t.fonts.body, fontSize: 16, color: selected ? t.colors.text : t.colors.placeholder }}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={20} color={t.colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'center', padding: 24 }}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.lg,
                borderWidth: 1,
                borderColor: t.colors.border,
                maxHeight: 360,
                overflow: 'hidden',
              },
              elevation(3),
            ]}
          >
            {label ? (
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 13, letterSpacing: 2, color: t.colors.textMuted, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6, textTransform: 'uppercase' }}>
                {label}
              </Text>
            ) : null}
            <ScrollView>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => { onChange?.(o.value); setOpen(false); }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      backgroundColor: pressed ? (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(232,85,31,0.06)') : 'transparent',
                    })}
                  >
                    <Text style={{ fontFamily: t.fonts.body, fontSize: 16, color: active ? t.colors.primary : t.colors.text, fontWeight: active ? '600' : '400' }}>
                      {o.label}
                    </Text>
                    {active ? <Check size={18} color={t.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
