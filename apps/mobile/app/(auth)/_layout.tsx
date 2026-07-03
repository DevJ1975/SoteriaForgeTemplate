/**
 * Auth group layout — the signed-out stack. A plain headerless Stack; routes
 * today are sign-in and forgot-password. (Sign-up is invite/admin-driven, and
 * enterprise SSO is deferred, so no self-service registration route exists yet.)
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
