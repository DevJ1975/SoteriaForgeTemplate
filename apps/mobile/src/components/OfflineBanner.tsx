/**
 * OfflineBanner — a slim status strip shown when the device is offline (and when
 * there is queued xAPI sync work pending upload).
 *
 * CONNECTIVITY SEAM (now wired): this component renders from the offline layer's
 * `useConnectivityOptional()` hook (src/offline), which is backed by a real
 * NetInfo subscription plus the append-only sync queue depth. The optional
 * variant is used so the banner still renders (as "online, nothing pending") if
 * it is ever mounted before/outside the OfflineProvider — the markup below is
 * unchanged from the shell's original seam.
 *
 * Colors/typography come from the flat @soteria-forge/ui theme: `warning` for
 * the offline strip, `info` for the syncing strip, `onPrimary` for readable
 * text on both, and the display font for the uppercase label.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useConnectivityOptional } from '../offline';

export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isOnline, pendingSyncCount } = useConnectivityOptional();

  // Nothing to say when online and fully synced.
  if (isOnline && pendingSyncCount === 0) return null;

  const backgroundColor = isOnline ? theme.colors.info : theme.colors.warning;
  const message = !isOnline
    ? pendingSyncCount > 0
      ? `Offline — ${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'} will sync when reconnected`
      : 'Offline — changes are saved on this device'
    : `Syncing ${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'}…`;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        { backgroundColor, paddingTop: insets.top > 0 ? insets.top : theme.spacing.sm },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.colors.onPrimary,
            fontFamily: theme.fonts.display,
          },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
