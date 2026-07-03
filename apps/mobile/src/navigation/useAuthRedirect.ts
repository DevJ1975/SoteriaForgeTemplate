/**
 * useAuthRedirect — the route guard that keeps the three identity zones mutually
 * exclusive based on the verified session + profile:
 *
 *   - the `(auth)` group (signed-out): sign-in;
 *   - the `join` screen (signed-in, NO profile yet): invite redemption;
 *   - the rest of the `(app)` group (signed-in WITH a profile/tenant): the app.
 *
 * Rules:
 *   - While the session is `loading`, do nothing (a splash renders).
 *   - `unauthenticated` and NOT in `(auth)` → send to sign-in.
 *   - `needs-profile` (signed in, no profile) and NOT already on `join` → send to
 *     the Join screen. This holds them out of BOTH the auth group and the tab
 *     app until they redeem an invite and a profile (tenant) exists.
 *   - `authenticated` and in `(auth)` OR on `join` → send to the app home. (The
 *     `join` case fires the moment redemption flips the status.)
 *
 * Because "authenticated" here means AuthProvider derived a verified identity
 * WITH a tenant (from the caller's profile row), a user can never reach the tab
 * app without a trusted tenant scope; and because "needs-profile" is a distinct
 * signed-in state, a session with no profile is never mistaken for signed-out.
 */
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../auth';

export function useAuthRedirect(): void {
  const { status } = useAuth();
  // Widen to string[] (safe: a tuple is assignable to its array type). Without
  // generated typed routes, expo-router's `RouteSegments<Route>` collapses to
  // the 1-tuple `[string]`, but at runtime `useSegments()` is the full path
  // split into segments — e.g. `/(app)/join` → `['(app)', 'join']` — so depth-2
  // reads are legitimate. `noUncheckedIndexedAccess` keeps each read
  // `string | undefined`, which the equality checks below handle.
  const segments: string[] = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    // `/(app)/join` → segments `['(app)', 'join']`.
    const onJoinScreen = segments[0] === '(app)' && segments[1] === 'join';

    if (status === 'unauthenticated') {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    if (status === 'needs-profile') {
      // Signed in but no tenant yet — corral to the Join screen no matter where
      // they landed (auth group, deep link, or a tab route).
      if (!onJoinScreen) router.replace('/(app)/join');
      return;
    }

    // status === 'authenticated': has a profile/tenant. Move out of the auth
    // group or off the Join screen and into the app.
    if (inAuthGroup || onJoinScreen) {
      router.replace('/(app)/(tabs)/home');
    }
  }, [status, segments, router]);
}
