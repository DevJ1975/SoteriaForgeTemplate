/**
 * Root layout — the top of the expo-router tree.
 *
 * Mounts app-wide providers, then a Stack that contains the two mutually
 * exclusive route groups: `(auth)` (signed-out) and `(app)` (signed-in). The
 * `useAuthRedirect` guard (run in the inner component, inside AuthProvider)
 * keeps the user in exactly one group based on the verified session.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AppProviders, useAuthRedirect } from '../src/navigation';
import { useAuth } from '../src/auth';
import { useTheme } from '../src/theme';

function RootNavigator() {
  const { status } = useAuth();
  const theme = useTheme();
  useAuthRedirect();

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bg.base,
        }}
      >
        <ActivityIndicator color={theme.colors.brand.blue} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <RootNavigator />
    </AppProviders>
  );
}
