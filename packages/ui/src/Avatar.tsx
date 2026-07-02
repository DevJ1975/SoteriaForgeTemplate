import React from 'react';
import { View, Text, Image } from 'react-native';
import { useTheme } from './theme';

export type AvatarStatus = 'online' | 'busy' | 'away' | 'offline';
export type AvatarProps = {
  /** image url string or a require()'d asset */
  source?: string | number;
  /** used for initials fallback */
  name?: string;
  size?: number;
  status?: AvatarStatus;
  /** notification count badge (top-right) */
  badgeCount?: number;
  /** ring colour behind the status dot / badge, usually the surface it sits on */
  ringColor?: string;
  style?: any;
};

export function Avatar({ source, name, size = 44, status, badgeCount, ringColor, style }: AvatarProps) {
  const t = useTheme();
  const ring = ringColor ?? t.colors.bg;
  const initials = (name || '')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const statusColors: Record<AvatarStatus, string> = {
    online: t.colors.success,
    busy: t.colors.danger,
    away: t.colors.warning,
    offline: t.colors.textMuted,
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `Avatar for ${name}` : initials ? `Avatar ${initials}` : 'Avatar'}
      style={[{ width: size, height: size }, style]}
    >
      {source ? (
        <Image source={typeof source === 'string' ? { uri: source } : source} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: size * 0.4, color: t.colors.onPrimary }}>{initials || '?'}</Text>
        </View>
      )}

      {status ? (
        <View
          style={{
            position: 'absolute', right: 0, bottom: 0,
            width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), borderRadius: size * 0.14,
            backgroundColor: statusColors[status], borderWidth: 2, borderColor: ring,
          }}
        />
      ) : null}

      {badgeCount ? (
        <View
          style={{
            position: 'absolute', right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
            backgroundColor: t.colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ring,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', fontFamily: t.fonts.body }}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </View>
      ) : null}
    </View>
  );
}
