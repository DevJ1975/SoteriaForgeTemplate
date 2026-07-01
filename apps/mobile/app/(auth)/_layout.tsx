/**
 * Auth group layout — the signed-out stack. A plain headerless Stack; the only
 * route today is sign-in. (Sign-up is invite/admin-driven, and enterprise SSO is
 * deferred, so no self-service registration route exists yet.)
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
