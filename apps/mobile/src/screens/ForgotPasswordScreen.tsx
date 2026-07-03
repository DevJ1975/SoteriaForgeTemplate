/**
 * ForgotPasswordScreen — request a password-reset email from Supabase Auth.
 *
 * The form collects ONLY an email address — never tenancy, never any
 * identifier the server would trust for authorization. On submit it calls
 * `useAuth().requestPasswordReset` (→ `supabase.auth.resetPasswordForEmail`)
 * and then shows a NEUTRAL confirmation that deliberately does not reveal
 * whether an account exists (anti-enumeration; Supabase answers OK for unknown
 * emails too). The emailed link completes the reset outside the app for now —
 * in-app deep-link completion is a documented follow-up — so the confirmation
 * tells the worker exactly what to do next.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Logo, TextField, useTheme } from '@soteria-forge/ui';
import { Screen } from '../components';
import { useAuth, isSupabaseConfigured } from '../auth';
import * as haptics from '../lib/haptics';

// Same cheap shape check the sign-in screen uses — the server is the real
// validator; this only catches obvious typos before a round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const backendReady = isSupabaseConfigured;

  const onSubmit = async () => {
    if (!email || submitting) return;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address, like you@company.com.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.ok) {
        haptics.success();
        setSent(true);
      } else {
        haptics.error();
        setEmailError(result.error ?? 'Could not send the reset email. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} keyboardAvoiding contentStyle={styles.center}>
      <View style={styles.header}>
        <Logo size={64} />
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 26,
            textAlign: 'center',
          }}
        >
          Reset your password
        </Text>
      </View>

      {sent ? (
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 17,
            }}
          >
            Check your email
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            If an account exists for {email.trim()}, a password-reset link is on
            its way. Open the link to set a new password, then come back here
            and sign in with it.
          </Text>
          <Button
            title="Back to sign in"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </Card>
      ) : (
        <View style={styles.form}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 14,
              lineHeight: 21,
              textAlign: 'center',
            }}
          >
            Enter the email you sign in with and we’ll send you a link to set a
            new password.
          </Text>
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
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />
          <Button
            title="Send reset link"
            fullWidth
            loading={submitting}
            disabled={!backendReady || !email}
            onPress={() => void onSubmit()}
          />
          <Button
            title="Back to sign in"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
          />
          {!backendReady ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 12.5,
                textAlign: 'center',
              }}
            >
              Backend not configured — set EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY to enable password reset.
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 28 },
  header: { gap: 12, alignItems: 'center' },
  form: { gap: 16 },
});
