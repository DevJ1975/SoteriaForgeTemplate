/**
 * App group layout — the signed-in stack.
 *
 * A Stack (not tabs) at this level so the course-detail route can push over the
 * tabbed home. The tab bar itself lives in `(tabs)/_layout.tsx` nested inside.
 * A belt-and-suspenders guard redirects to sign-in if somehow rendered while
 * unauthenticated (the root guard should already prevent this).
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
    </Stack>
  );
}
