import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';

export type TableAlign = 'left' | 'right' | 'center';
export type TableColumn = { key: string; label: string; align?: TableAlign; flex?: number };
export type TableCell = string | number | { text: string | number; color?: string; bold?: boolean };
export type TableRow = Record<string, TableCell>;

export type DataTableProps = {
  columns: TableColumn[];
  rows: TableRow[];
  /** highlight the last column's header in ember */
  accentLastColumn?: boolean;
  style?: any;
};

/** Branded table: charcoal header, hairline rows, per-cell colour support. */
export function DataTable({ columns, rows, accentLastColumn = true, style }: DataTableProps) {
  const t = useTheme();
  const map = (a?: TableAlign) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');
  const txtAlign = (a?: TableAlign) => (a || 'left');

  return (
    <View style={[{ borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radii.md, overflow: 'hidden' }, style]}>
      {/* header */}
      <View style={{ flexDirection: 'row', backgroundColor: t.mode === 'dark' ? '#0F1114' : '#1A1D22' }}>
        {columns.map((c, i) => {
          const last = i === columns.length - 1;
          return (
            <View key={c.key} style={{ flex: c.flex ?? 1, paddingVertical: 11, paddingHorizontal: 14, alignItems: map(c.align) }}>
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 12, letterSpacing: 1.2, color: accentLastColumn && last ? '#FFB089' : '#F4F2EE' }}>
                {c.label.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
      {/* rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', backgroundColor: t.colors.card, borderTopWidth: 1, borderTopColor: t.colors.border }}>
          {columns.map((c) => {
            const raw = row[c.key];
            const cell = typeof raw === 'object' && raw !== null ? raw : { text: raw as string | number };
            return (
              <View key={c.key} style={{ flex: c.flex ?? 1, paddingVertical: 11, paddingHorizontal: 14, alignItems: map(c.align) }}>
                <Text
                  style={{
                    fontFamily: cell.bold ? t.fonts.display : t.fonts.body,
                    fontWeight: cell.bold ? '600' : '400',
                    fontSize: 14.5,
                    textAlign: txtAlign(c.align),
                    color: cell.color ?? t.colors.text,
                  }}
                >
                  {cell.text}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
