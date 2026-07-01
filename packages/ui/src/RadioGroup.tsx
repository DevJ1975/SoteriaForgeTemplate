import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type RadioOption = { label: string; value: string; description?: string };

export type RadioGroupProps = {
  value?: string;
  options: RadioOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RadioGroup({ value, options, onChange, disabled, style }: RadioGroupProps) {
  const t = useTheme();
  return (
    <View style={[{ gap: 10 }, style as ViewStyle]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange?.(o.value)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, opacity: disabled ? 0.5 : 1 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: active ? t.colors.primary : t.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {active ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: t.colors.primary }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.fonts.body, fontSize: 15, color: t.colors.text, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
              {o.description ? (
                <Text style={{ fontFamily: t.fonts.body, fontSize: 13, color: t.colors.textMuted, marginTop: 2 }}>{o.description}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
