import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';
import { Avatar } from './Avatar';
import { RankMedal } from './RankMedal';

export type LeaderboardRowProps = {
  rank: number;
  name: string;
  sublabel?: string;
  score: string | number;
  scoreUnit?: string;
  avatarSource?: string | number;
  /** rank change since last period: +2 (up), -1 (down), 0 (same) */
  delta?: number;
  /** highlight as the current user */
  highlight?: boolean;
  onPress?: () => void;
  style?: any;
};

/** A single leaderboard standing — medal/number, avatar, name, score, and movement. */
export function LeaderboardRow({
  rank, name, sublabel, score, scoreUnit, avatarSource, delta, highlight, onPress, style,
}: LeaderboardRowProps) {
  const t = useTheme();
  const top3 = rank <= 3;

  const deltaColor = delta == null || delta === 0 ? t.colors.textMuted : delta > 0 ? t.colors.success : t.colors.danger;
  const deltaGlyph = delta == null || delta === 0 ? '—' : delta > 0 ? '▲' : '▼';

  return (
    <View
      // @ts-ignore onStartShouldSetResponder for press without importing Pressable when not needed
      onTouchEnd={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: t.radii.md,
          backgroundColor: highlight ? (t.mode === 'dark' ? 'rgba(255,122,61,0.14)' : 'rgba(232,85,31,0.08)') : t.colors.card,
          borderWidth: 1,
          borderColor: highlight ? (t.mode === 'dark' ? 'rgba(255,122,61,0.4)' : 'rgba(232,85,31,0.32)') : t.colors.border,
        },
        style,
      ]}
    >
      {/* rank */}
      <View style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}>
        {top3 ? (
          <RankMedal rank={rank} size={44} />
        ) : (
          <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 20, color: t.colors.textMuted }}>{rank}</Text>
        )}
      </View>

      {/* avatar + name */}
      <Avatar source={avatarSource} name={name} size={40} ringColor={highlight ? undefined : t.colors.card} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 16, color: t.colors.text }}>
          {name}
        </Text>
        {sublabel ? (
          <Text numberOfLines={1} style={{ fontFamily: t.fonts.body, fontSize: 12.5, color: t.colors.textMuted, marginTop: 1 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {/* delta */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 34, justifyContent: 'flex-end' }}>
        <Text style={{ color: deltaColor, fontSize: 10 }}>{deltaGlyph}</Text>
        {delta != null && delta !== 0 ? (
          <Text style={{ color: deltaColor, fontFamily: t.fonts.body, fontWeight: '600', fontSize: 12.5 }}>{Math.abs(delta)}</Text>
        ) : null}
      </View>

      {/* score */}
      <View style={{ alignItems: 'flex-end', minWidth: 58 }}>
        <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 18, color: highlight ? t.colors.primary : t.colors.text }}>
          {score}
        </Text>
        {scoreUnit ? (
          <Text style={{ fontFamily: t.fonts.body, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: t.colors.textMuted }}>
            {scoreUnit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
