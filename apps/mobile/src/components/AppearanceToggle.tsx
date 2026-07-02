/**
 * AppearanceToggle — a compact light / dark / system segmented control.
 *
 * Built from kit Chips (with SunIcon / MoonIcon leading glyphs) over the
 * app-level theme controls: an explicit choice sets the persisted scheme
 * override ('sf.appearance' in AsyncStorage, via ThemeProvider), and "Auto"
 * clears it to follow the device. Selection fires a light haptic tick
 * (fail-silent if the native module is absent).
 */
import { StyleSheet, Text, View } from 'react-native';
import { Chip, MoonIcon, SunIcon } from '@soteria-forge/ui';
import { useTheme, useThemeControls, type ColorScheme } from '../theme';
import * as haptics from '../lib/haptics';

type Segment = { key: ColorScheme | null; label: string };

const SEGMENTS: Segment[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: null, label: 'Auto' },
];

export function AppearanceToggle() {
  const theme = useTheme();
  const { scheme, schemeOverride, setSchemeOverride } = useThemeControls();

  const onSelect = (next: ColorScheme | null) => {
    if (next === schemeOverride) return;
    haptics.selection();
    setSchemeOverride(next);
  };

  const iconColor = (selected: boolean) =>
    selected ? theme.colors.primary : theme.colors.textMuted;

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.row}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.display,
          fontWeight: '600',
          fontSize: 12,
          letterSpacing: 1.5,
        }}
      >
        APPEARANCE
      </Text>
      <View style={styles.chips}>
        {SEGMENTS.map((segment) => {
          const selected = schemeOverride === segment.key;
          return (
            <Chip
              key={segment.label}
              label={segment.label}
              selected={selected}
              onPress={() => onSelect(segment.key)}
              leftIcon={
                segment.key === 'light' ? (
                  <SunIcon size={15} color={iconColor(selected)} />
                ) : segment.key === 'dark' ? (
                  <MoonIcon size={15} color={iconColor(selected)} />
                ) : // "Auto" mirrors whatever the device currently resolves to.
                scheme === 'dark' ? (
                  <MoonIcon size={15} color={iconColor(selected)} />
                ) : (
                  <SunIcon size={15} color={iconColor(selected)} />
                )
              }
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  chips: { flexDirection: 'row', gap: 8 },
});
