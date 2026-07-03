import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useTheme, elevation } from './theme';

export type DatePickerProps = {
  value?: Date | null;
  onChange?: (d: Date) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: any;
};

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// `getMonth()` is always 0–11, but under `noUncheckedIndexedAccess` the indexed
// read is `string | undefined` — fall back to '' rather than crash on a
// hypothetical out-of-range value.
const fmt = (d: Date) => `${MONTHS[d.getMonth()]?.slice(0, 3) ?? ''} ${d.getDate()}, ${d.getFullYear()}`;

/**
 * Cross-platform date picker — a self-contained calendar in a modal.
 * No native date-picker module required, so it looks identical everywhere.
 */
export function DatePicker({ value, onChange, label, placeholder = 'Select a date', disabled, style }: DatePickerProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date());

  const y = view.getFullYear();
  const m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSel = (d: number) => !!value && value.getFullYear() === y && value.getMonth() === m && value.getDate() === d;
  const isToday = (d: number) => {
    const n = new Date();
    return n.getFullYear() === y && n.getMonth() === m && n.getDate() === d;
  };

  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 13, color: t.colors.textMuted }}>{label}</Text> : null}

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderWidth: 1.5, borderColor: open ? t.colors.primary : t.colors.border, backgroundColor: t.colors.inputBg,
          borderRadius: t.radii.sm + 2, paddingHorizontal: 14, minHeight: 48, opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text style={{ fontFamily: t.fonts.body, fontSize: 16, color: value ? t.colors.text : t.colors.placeholder }}>
          {value ? fmt(value) : placeholder}
        </Text>
        <Text style={{ fontSize: 16, color: t.colors.textMuted }}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={[{ width: '100%', maxWidth: 360, backgroundColor: t.colors.surface, borderRadius: t.radii.lg, borderWidth: 1, borderColor: t.colors.border, padding: 18 }, elevation(3)]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Pressable hitSlop={10} onPress={() => setView(new Date(y, m - 1, 1))} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 22, color: t.colors.textMuted }}>‹</Text>
              </Pressable>
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 17, color: t.colors.text }}>{MONTHS[m]} {y}</Text>
              <Pressable hitSlop={10} onPress={() => setView(new Date(y, m + 1, 1))} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 22, color: t.colors.textMuted }}>›</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row' }}>
              {DOW.map((d, i) => (
                <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: t.colors.textMuted, fontFamily: t.fonts.body, marginBottom: 6 }}>{d}</Text>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => (
                <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  {d ? (
                    <Pressable
                      onPress={() => { onChange?.(new Date(y, m, d)); setOpen(false); }}
                      style={{
                        flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isSel(d) ? t.colors.primary : 'transparent',
                        borderWidth: isToday(d) && !isSel(d) ? 1.5 : 0, borderColor: t.colors.primary,
                      }}
                    >
                      <Text style={{ fontFamily: t.fonts.body, fontSize: 14.5, color: isSel(d) ? t.colors.onPrimary : t.colors.text }}>{d}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
