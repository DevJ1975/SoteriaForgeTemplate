import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTheme, elevation } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  sm: { padV: 8, padH: 14, font: 14, gap: 6 },
  md: { padV: 12, padH: 20, font: 16, gap: 8 },
  lg: { padV: 15, padH: 26, font: 18, gap: 10 },
} as const;

export function Button({
  title, onPress, variant = 'primary', size = 'md',
  disabled, loading, fullWidth, leftIcon, rightIcon, style,
}: ButtonProps) {
  const t = useTheme();
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const palettes: Record<ButtonVariant, { bg: string; bgPressed: string; fg: string; border: string }> = {
    primary: { bg: t.colors.primary, bgPressed: t.colors.primaryPressed, fg: t.colors.onPrimary, border: 'transparent' },
    secondary: { bg: 'transparent', bgPressed: t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(232,85,31,0.06)', fg: t.colors.text, border: t.colors.border },
    ghost: { bg: 'transparent', bgPressed: t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(232,85,31,0.08)', fg: t.colors.primary, border: 'transparent' },
    danger: { bg: t.colors.danger, bgPressed: '#9E2E22', fg: '#FFFFFF', border: 'transparent' },
  };
  const p = palettes[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s.gap,
          paddingVertical: s.padV,
          paddingHorizontal: s.padH,
          borderRadius: t.radii.sm + 2,
          backgroundColor: pressed ? p.bgPressed : p.bg,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: p.border,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' && !isDisabled ? elevation(1) : null,
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.fg} />
      ) : (
        <>
          {leftIcon ? <View>{leftIcon}</View> : null}
          <Text
            style={{
              color: p.fg,
              fontFamily: t.fonts.display,
              fontWeight: '600',
              fontSize: s.font,
              letterSpacing: 0.3,
            } as TextStyle}
          >
            {title}
          </Text>
          {rightIcon ? <View>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
