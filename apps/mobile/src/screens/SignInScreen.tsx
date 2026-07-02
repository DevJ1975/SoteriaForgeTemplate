/**
 * SignInScreen — email/password sign-in against Supabase Auth.
 *
 * On success, `useAuth().signIn` refreshes the session; the resulting identity
 * (including the tenantId + role from the caller's `public.profiles` row) is
 * projected by AuthProvider. This screen NEVER collects or forwards a tenantId —
 * tenancy is decided entirely by the user's profile, not by anything typed here,
 * and RLS derives it from the session server-side.
 *
 * Enterprise SSO (per-tenant SAML/OIDC) is deferred; a placeholder affordance
 * documents where the federated redirect will go.
 *
 * Re-skinned on the @soteria-forge/ui kit: the Forged-Shield Logo, kit TextField
 * (with a tap-to-reveal password adornment + email keyboard), a primary kit
 * Button, and sign-in errors surfaced both inline (field helper text) and via
 * the kit Toast snackbar. All colour/type flows through useTheme() tokens — no
 * hardcoded brand hex.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { Button, Logo, TextField, useTheme, useToast } from '@soteria-forge/ui';
import { Screen } from '../components';
import { useAuth, isSupabaseConfigured } from '../auth';
import * as haptics from '../lib/haptics';

// Deliberately simple shape check (something@something.tld) — the server is the
// real validator; this only catches obvious typos before a round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const backendReady = isSupabaseConfigured;

  // Surface auth errors from useAuth() as a transient snackbar in addition to
  // the inline field helper, so a failure is noticed even off-screen.
  useEffect(() => {
    if (error) toast(error, { type: 'danger' });
  }, [error, toast]);

  const onSubmit = async () => {
    if (!email || !password || submitting) return;
    // Cheap client-side shape check before hitting the network. Credentials
    // sent are unchanged — this only gates obviously-malformed input.
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address, like you@company.com.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      // Tenancy is NOT collected here — only email/password. The tenant + role
      // are projected from the caller's profile by AuthProvider after this
      // resolves (RLS derives the tenant from the session; the client never
      // sends one). `username` carries the email for call-site compatibility.
      await signIn({ username: email.trim(), password });
    } catch {
      // error surfaced via useAuth().error (inline helper + toast effect above)
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} keyboardAvoiding contentStyle={styles.center}>
      <View style={styles.header}>
        <Logo size={72} />
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 34,
            letterSpacing: 0.5,
          }}
        >
          SOTERIA<Text style={{ color: theme.colors.primary }}> FORGE</Text>
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 15,
            textAlign: 'center',
          }}
        >
          Field-ready training. Sign in to continue.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email"
          placeholder="you@company.com"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          errorText={emailError ?? undefined}
          // Focus chain: "next" hops to the password field without dropping the keyboard.
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          // "Go" submits straight from the keyboard.
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
          // Inline sign-in failures land on the password field; tenancy is never
          // part of this form, so the error is always a credential/backend issue.
          errorText={error ?? undefined}
          rightIcon={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={8}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.fonts.display,
                  fontWeight: '600',
                  fontSize: 12.5,
                  letterSpacing: 0.6,
                }}
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </Text>
            </Pressable>
          }
        />

        <Button
          title="Sign in"
          onPress={onSubmit}
          fullWidth
          loading={submitting}
          disabled={!backendReady || !email || !password}
        />

        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 12.5,
            textAlign: 'center',
          }}
        >
          {!backendReady
            ? 'Backend not configured — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (copy .env.example to .env) to enable sign-in.'
            : 'Enterprise SSO for your organization is coming soon.'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 36 },
  header: { gap: 12, alignItems: 'center' },
  form: { gap: 16 },
});
