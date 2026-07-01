/**
 * Tabs layout — the primary signed-in navigation: Home + Courses.
 *
 * Tab colors are pulled from the theme (brand blue for the active tab) so the
 * chrome matches the @soteria-forge/ui token set.
 */
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '../../../src/theme';

/** Minimal text glyph tab icon — avoids pulling an icon font into the scaffold. */
function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg.base },
        headerTintColor: theme.colors.text.primary,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.colors.brand.blue,
        tabBarInactiveTintColor: theme.colors.text.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.bg.surface,
          borderTopColor: theme.colors.border.subtle,
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
    </Tabs>
  );
}
