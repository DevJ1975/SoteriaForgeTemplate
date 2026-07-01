/**
 * AppProviders — the single composition of app-wide context providers, mounted
 * once by the root layout (app/_layout.tsx).
 *
 * Order matters:
 *   1. SafeAreaProvider — geometry for themed safe-area screens.
 *   2. GestureHandlerRootView — required by navigation gestures / reanimated.
 *   3. ThemeProvider — brings the @soteria-forge/ui tokens into RN.
 *   4. ToastProvider — kit snackbar host; INSIDE ThemeProvider so useToast() and
 *      the toast's themed styling are available app-wide.
 *   5. AuthProvider — the verified-identity source (tenantId + role, from the
 *      caller's Supabase session + profile).
 *   6. OfflineProvider — NetInfo + sync-engine lifecycle, INSIDE AuthProvider.
 *
 * There is no explicit backend "configure" step: the Supabase client
 * (src/supabase) self-configures from EXPO_PUBLIC_SUPABASE_URL /
 * EXPO_PUBLIC_SUPABASE_ANON_KEY at import time. If those are unset the app still
 * boots (unauthenticated) and screens show an unconfigured state.
 */
import { type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@soteria-forge/ui';
import { ThemeProvider } from '../theme';
import { AuthProvider } from '../auth';
import { OfflineProvider } from '../offline';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* Kit snackbar host — inside ThemeProvider so its themed styling
              resolves, and above the auth/offline layers so useToast() works
              from anywhere in the tree. */}
          <ToastProvider>
            {/* OfflineProvider runs the NetInfo subscription + sync-engine
                lifecycle and publishes { isOnline, pendingSyncCount } to the app.
                It sits INSIDE AuthProvider so it can rely on the verified identity
                being available to consumers, while the append-only WatermelonDB
                store it drives is the source of truth until sync. */}
            <AuthProvider>
              <OfflineProvider>{children}</OfflineProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
