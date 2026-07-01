/**
 * HomeScreen — tenant-aware landing for a signed-in learner.
 *
 * The greeting and every downstream data read are scoped to the VERIFIED
 * tenantId from the token (via useAuth). Nothing here trusts client-supplied
 * tenancy. Groups drive which affordances show (e.g. supervisors get a team
 * entry point) — again straight from the token claim.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hasMinimumGroup } from '@soteria-forge/shared';
import { Screen } from '../components';
import { useAuth } from '../auth';
import { useTheme } from '../theme';

export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();

  if (!user) return null;

  const firstName = (user.displayName ?? user.email ?? user.username).split(' ')[0];
  const isSupervisor = hasMinimumGroup(user.groups, 'supervisor');

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={{ color: theme.colors.text.muted, fontSize: theme.fontSize.sm }}>
          Welcome back
        </Text>
        <Text
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.fontSize['2xl'],
            fontWeight: theme.fontWeight.bold,
          }}
        >
          {firstName}
        </Text>
        <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.sm }}>
          Tenant: {user.tenantId}
          {isSupervisor ? '  ·  Supervisor' : ''}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(app)/(tabs)/courses')}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.bg.surface,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.radii.lg,
            opacity: pressed ? 0.9 : 1,
            ...theme.elevation.sm,
          },
        ]}
      >
        <Text
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          My courses
        </Text>
        <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.sm }}>
          Continue your assigned training for this organization.
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ color: theme.colors.text.link, fontSize: theme.fontSize.sm }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  card: { padding: 20, borderWidth: 1, gap: 6 },
  signOut: { paddingVertical: 12, alignItems: 'flex-start' },
});
