/**
 * App group layout — the signed-in stack.
 *
 * A Stack (not tabs) at this level so the course-detail route can push over the
 * tabbed home. The tab bar itself lives in `(tabs)/_layout.tsx` nested inside.
 *
 * This group hosts BOTH signed-in-with-profile screens (tabs, course detail) and
 * the `join` screen for the signed-in-WITHOUT-profile (`needs-profile`) state —
 * both require a verified session, so both belong here. The fine-grained routing
 * (needs-profile → join; authenticated → tabs) is the central `useAuthRedirect`
 * guard's job; this layout only does a belt-and-suspenders redirect to sign-in if
 * it is somehow rendered while fully `unauthenticated`.
 */
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useTheme } from '../../src/theme';

export default function AppLayout() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === 'unauthenticated') {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
      <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
      {/* Signed in, no profile yet — the "join a tenant" flow. Full-screen (no
          header) so it reads like an onboarding step, not a nested app screen. */}
      <Stack.Screen name="join" options={{ headerShown: false }} />
    </Stack>
  );
}
