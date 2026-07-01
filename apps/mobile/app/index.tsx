/**
 * Index route — a neutral entry that immediately defers to the auth guard.
 *
 * `useAuthRedirect` (mounted in the root layout) sends the user to the right
 * zone as soon as the session + profile resolve, so this route only needs to
 * render a splash while `status === 'loading'`. The redirects here mirror the
 * guard's three signed-in/out zones for a snappy first navigation.
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';

export default function Index() {
  const { status } = useAuth();

  if (status === 'authenticated') return <Redirect href="/(app)/(tabs)/home" />;
  // Signed in but no profile/tenant yet → join a team first.
  if (status === 'needs-profile') return <Redirect href="/(app)/join" />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/sign-in" />;
  // loading → root layout shows the splash
  return null;
}
