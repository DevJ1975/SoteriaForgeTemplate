/**
 * useAuthRedirect — the route guard that keeps the auth stack and the app stack
 * mutually exclusive based on the verified session.
 *
 * Rules:
 *   - While the session is `loading`, do nothing (a splash renders).
 *   - If unauthenticated and NOT already in the `(auth)` group → send to sign-in.
 *   - If authenticated and currently in the `(auth)` group → send to the app home.
 *
 * Because "authenticated" here means AuthProvider successfully derived a
 * verified identity WITH a `custom:tenantId` claim, a user can never reach the
 * app stack without a trusted tenant scope.
 */
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../auth';

export function useAuthRedirect(): void {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (status === 'authenticated' && inAuthGroup) {
      router.replace('/(app)/(tabs)/home');
    }
  }, [status, segments, router]);
}
