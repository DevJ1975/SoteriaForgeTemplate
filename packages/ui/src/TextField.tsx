import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import type { StyleProp, ViewStyle, TextInputProps } from 'react-native';
import { useTheme } from './theme';

export type TextFieldProps = {
  label?: string;
  value?: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  style?: StyleProp<ViewStyle>;
};

export function TextField({
  label, value, onChangeText, placeholder, helperText, errorText,
  disabled, secureTextEntry, leftIcon, rightIcon, multiline, keyboardType, autoCapitalize, style,
}: TextFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const invalid = !!errorText;

  const borderColor = invalid ? t.colors.danger : focused ? t.colors.primary : t.colors.border;

  return (
    <View style={[{ gap: 6 }, style as ViewStyle]}>
      {label ? (
        <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 13, letterSpacing: 0.2, color: t.colors.textMuted }}>
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: disabled ? (t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F3F1EC') : t.colors.inputBg,
          borderRadius: t.radii.sm + 2,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          minHeight: multiline ? 96 : 48,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {leftIcon ? <View style={{ paddingTop: multiline ? 2 : 0 }}>{leftIcon}</View> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.placeholder}
          editable={!disabled}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            color: t.colors.text,
            fontFamily: t.fonts.body,
            fontSize: 16,
            paddingVertical: multiline ? 0 : 12,
            // remove the web outline; native ignores this key
            ...(({ outlineStyle: 'none' } as any)),
          }}
        />
        {rightIcon ? <View>{rightIcon}</View> : null}
      </View>

      {invalid ? (
        <Text style={{ fontFamily: t.fonts.body, fontSize: 12.5, color: t.colors.danger }}>{errorText}</Text>
      ) : helperText ? (
        <Text style={{ fontFamily: t.fonts.body, fontSize: 12.5, color: t.colors.textMuted }}>{helperText}</Text>
      ) : null}
    </View>
  );
}
