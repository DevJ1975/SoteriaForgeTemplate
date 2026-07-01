/**
 * Root layout — the top of the expo-router tree.
 *
 * Mounts app-wide providers, then a Stack that contains the two mutually
 * exclusive route groups: `(auth)` (signed-out) and `(app)` (signed-in). The
 * `useAuthRedirect` guard (run in the inner component, inside AuthProvider)
 * keeps the user in exactly one group based on the verified session.
 *
 * Fonts: the Soteria Forge design language uses Oswald (display) + Barlow Semi
 * Condensed (body). We load them here via expo-google-fonts and gate first paint
 * on them being ready (same spinner used for the auth-loading state), so kit
 * components never flash the system fallback.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import {
  useFonts as useOswald,
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import {
  BarlowSemiCondensed_400Regular,
  BarlowSemiCondensed_500Medium,
  BarlowSemiCondensed_600SemiBold,
} from '@expo-google-fonts/barlow-semi-condensed';
import { AppProviders, useAuthRedirect } from '../src/navigation';
import { useAuth } from '../src/auth';
import { useTheme } from '../src/theme';

/** Full-screen brand spinner, reused for both font- and auth-loading gates. */
function LoadingScreen() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  useAuthRedirect();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  // Load the display + body families before first paint. Family names here must
  // match the kit theme's `fonts` tokens (Oswald_600SemiBold /
  // BarlowSemiCondensed_500Medium); the extra weights are available for emphasis.
  const [fontsLoaded] = useOswald({
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    BarlowSemiCondensed_400Regular,
    BarlowSemiCondensed_500Medium,
    BarlowSemiCondensed_600SemiBold,
  });

  return (
    <AppProviders>
      <StatusBar style="auto" />
      {fontsLoaded ? <RootNavigator /> : <LoadingScreen />}
    </AppProviders>
  );
}
