/**
 * Index route — a neutral entry that immediately defers to the auth guard.
 *
 * `useAuthRedirect` (mounted in the root layout) sends the user to `(auth)` or
 * `(app)` as soon as the session resolves, so this route only needs to render a
 * splash while `status === 'loading'`.
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';

export default function Index() {
  const { status } = useAuth();

  if (status === 'authenticated') return <Redirect href="/(app)/(tabs)/home" />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/sign-in" />;
  // loading → root layout shows the splash
  return null;
}
