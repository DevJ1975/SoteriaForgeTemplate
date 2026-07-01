/**
 * SignInScreen — email/password sign-in against the single Cognito user pool.
 *
 * On success, `useAuth().signIn` refreshes the session; the resulting identity
 * (including the verified `custom:tenantId`) is projected by AuthProvider. This
 * screen NEVER collects or forwards a tenantId — tenancy is decided entirely by
 * the user's Cognito account, not by anything typed here.
 *
 * Enterprise SSO (per-tenant SAML/OIDC federated into the one pool) is deferred;
 * a placeholder affordance documents where the hosted-UI redirect will go.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components';
import { useAuth, isAmplifyConfigured } from '../auth';
import { useTheme } from '../theme';

export function SignInScreen() {
  const theme = useTheme();
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const backendReady = isAmplifyConfigured();

  const onSubmit = async () => {
    if (!email || !password || submitting) return;
    setSubmitting(true);
    try {
      await signIn({ username: email.trim(), password });
    } catch {
      // error surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.center}>
      <View style={styles.header}>
        <Text
          style={{
            color: theme.colors.brand.blue,
            fontSize: theme.fontSize['3xl'],
            fontWeight: theme.fontWeight.bold,
            letterSpacing: theme.letterSpacing.tight,
          }}
        >
          Soteria Forge
        </Text>
        <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.base }}>
          Field-ready training. Sign in to continue.
        </Text>
      </View>

      <View style={styles.form}>
        <TextInput
          placeholder="Email"
          placeholderTextColor={theme.colors.text.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={[
            styles.input,
            {
              borderColor: theme.colors.border.default,
              color: theme.colors.text.primary,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.bg.surface,
            },
          ]}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={theme.colors.text.muted}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          style={[
            styles.input,
            {
              borderColor: theme.colors.border.default,
              color: theme.colors.text.primary,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.bg.surface,
            },
          ]}
        />

        {error ? (
          <Text style={{ color: theme.colors.semantic.danger, fontSize: theme.fontSize.sm }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={submitting || !backendReady}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.colors.brand.blue,
              borderRadius: theme.radii.md,
              opacity: submitting || !backendReady ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.text.inverse} />
          ) : (
            <Text
              style={{
                color: theme.colors.text.inverse,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              Sign in
            </Text>
          )}
        </Pressable>

        {!backendReady ? (
          <Text style={{ color: theme.colors.text.muted, fontSize: theme.fontSize.xs }}>
            Backend not deployed yet — sign-in is disabled until a Cognito pool exists
            (run `npx ampx sandbox` in backend/).
          </Text>
        ) : (
          <Text style={{ color: theme.colors.text.muted, fontSize: theme.fontSize.xs }}>
            Enterprise SSO for your organization is coming soon.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 32 },
  header: { gap: 8, alignItems: 'center' },
  form: { gap: 12 },
  input: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
