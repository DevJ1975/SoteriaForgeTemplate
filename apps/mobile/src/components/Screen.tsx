/**
 * Screen — a themed safe-area container every screen sits inside.
 *
 * Centralizes the base background + safe-area handling + the OfflineBanner so
 * individual screens focus on content. Reads all visual values from the theme
 * (which is the `@soteria-forge/ui` token set), never hardcoded colors.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { OfflineBanner } from './OfflineBanner';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. Default true. */
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  const theme = useTheme();
  const body = (
    <View style={[styles.body, { padding: theme.spacing[5] }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.colors.bg.base }]}
    >
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  body: { flex: 1, gap: 16 },
});
