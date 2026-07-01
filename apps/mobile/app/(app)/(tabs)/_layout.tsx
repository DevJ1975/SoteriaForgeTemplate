/**
 * Tabs layout — the primary signed-in navigation: Home + Courses + Showcase.
 *
 * Tab colors are pulled from the flat @soteria-forge/ui theme (brand ember for
 * the active tab) so the chrome matches the kit's design language.
 */
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../../src/auth';
import { useTheme } from '../../../src/theme';

/** Minimal text glyph tab icon — avoids pulling an icon font into the scaffold. */
function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  // Belt-and-suspenders: the tab screens read the verified tenantId (which only
  // exists once a profile does). If we somehow reach here without a full
  // `authenticated` identity (e.g. a deep link during `needs-profile`), redirect
  // out BEFORE the tab screens mount, so none of them call useTenantId() without
  // a tenant. The central guard also handles this; this just avoids a render race.
  if (status === 'needs-profile') return <Redirect href="/(app)/join" />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color }) => <TabGlyph glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="showcase"
        options={{
          title: 'Showcase',
          tabBarIcon: ({ color }) => <TabGlyph glyph="◆" color={color} />,
        }}
      />
    </Tabs>
  );
}
