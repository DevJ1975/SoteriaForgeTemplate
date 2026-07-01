/**
 * AppProviders — the single composition of app-wide context providers, mounted
 * once by the root layout (app/_layout.tsx).
 *
 * Order matters:
 *   1. configureAmplify() runs before render so auth transport is ready.
 *   2. SafeAreaProvider — geometry for themed safe-area screens.
 *   3. GestureHandlerRootView — required by navigation gestures / reanimated.
 *   4. ThemeProvider — brings the @soteria-forge/ui tokens into RN.
 *   5. AuthProvider — the verified-identity source (tenantId + groups).
 *
 * The offline layer's provider (from src/offline/**, owned by a later agent)
 * will slot in AROUND AuthProvider once it exists — its documented seam is here.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme';
import { AuthProvider, configureAmplify } from '../auth';
import { OfflineProvider } from '../offline';

export function AppProviders({ children }: { children: ReactNode }) {
  // Configure Amplify exactly once, before the first auth read.
  const configured = useRef(false);
  if (!configured.current) {
    // WIRE-UP SEAM: once `backend/` is deployed (or `npx ampx sandbox` has run)
    // an `amplify_outputs.json` is generated at the app root. Import it and pass
    // it in — that single edit switches the app from "backend not deployed" to
    // fully authenticated. We do NOT statically import it now because the file
    // does not exist yet and a literal import of a missing module is a
    // build-time error in Metro.
    //
    //   import amplifyOutputs from '../../amplify_outputs.json';
    //   configureAmplify(amplifyOutputs);
    //
    // Until then, configure with no outputs → boots unauthenticated.
    configureAmplify(null);
    configured.current = true;
  }

  useEffect(() => {
    // Kept for symmetry / future async init (e.g. offline store open).
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* OFFLINE SEAM (now wired): OfflineProvider runs the NetInfo
              subscription + sync-engine lifecycle and publishes
              { isOnline, pendingSyncCount } to the app. It sits INSIDE
              AuthProvider so it can rely on the verified identity being
              available to consumers, while the append-only WatermelonDB store it
              drives is the source of truth until sync. */}
          <AuthProvider>
            <OfflineProvider>{children}</OfflineProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
