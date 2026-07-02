/**
 * Screen — a themed safe-area container every screen sits inside.
 *
 * Centralizes the base background + safe-area handling + the OfflineBanner so
 * individual screens focus on content. Reads all visual values from the theme
 * (which is the `@soteria-forge/ui` token set), never hardcoded colors.
 *
 * Optional affordances (defaults preserve the original behavior exactly):
 *   - `onRefresh` / `refreshing` → a RefreshControl on the internal ScrollView
 *     (only meaningful with `scroll` true). When `refreshing` isn't provided the
 *     component manages its own spinner state around the (possibly async)
 *     `onRefresh`.
 *   - `keyboardAvoiding` → wraps content in a KeyboardAvoidingView so inputs
 *     stay visible above the keyboard (behavior: padding on iOS / height on
 *     Android).
 */
import { useCallback, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { OfflineBanner } from './OfflineBanner';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. Default true. */
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Pull-to-refresh handler (requires `scroll`). May be async. */
  onRefresh?: () => Promise<void> | void;
  /** Controlled refreshing flag; omit to let Screen manage it around `onRefresh`. */
  refreshing?: boolean;
  /** Keep inputs visible above the keyboard. Default false. */
  keyboardAvoiding?: boolean;
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
  onRefresh,
  refreshing,
  keyboardAvoiding = false,
}: ScreenProps) {
  const theme = useTheme();
  const [internalRefreshing, setInternalRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    const result = onRefresh();
    // Uncontrolled mode: drive the spinner around the handler's lifetime.
    if (refreshing === undefined) {
      setInternalRefreshing(true);
      void Promise.resolve(result).finally(() => setInternalRefreshing(false));
    }
  }, [onRefresh, refreshing]);

  const body = (
    <View style={[styles.body, { padding: theme.spacing.xl }, contentStyle]}>{children}</View>
  );

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? internalRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        ) : undefined
      }
    >
      {body}
    </ScrollView>
  ) : (
    body
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <OfflineBanner />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  body: { flex: 1, gap: 16 },
});
