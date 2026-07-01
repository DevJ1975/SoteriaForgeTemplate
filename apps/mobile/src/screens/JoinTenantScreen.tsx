/**
 * JoinTenantScreen — "Join your team" (invite redemption).
 *
 * Reached ONLY when the caller is signed in but has no profile yet
 * (`status === 'needs-profile'`): a valid Supabase session exists, but the 1:1
 * `public.profiles` row hasn't been created, so RLS shows them nothing and there
 * is no tenant to operate under. Redeeming an invite creates that profile
 * server-side and lands the user in exactly one tenant.
 *
 * SECURITY (the #1 rule): this screen NEVER collects or sends a tenant_id. The
 * only thing the user provides is an opaque invite token (paste the token itself
 * or an invite link — we extract the token from it). `redeem_invitation` is
 * called with just that token; the server validates it against the caller's
 * VERIFIED email and derives the tenant from the invitation. A forged or
 * mismatched token simply fails — it cannot widen access to another tenant. The
 * token is transient UI state only; it is never persisted or used for scoping.
 *
 * Built on the @soteria-forge/ui kit: a Card with a TextField for the token, a
 * primary Button to redeem, inline helper/error text, and success/failure toasts.
 * All colour/type comes from useTheme() tokens — no hardcoded brand hex.
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Button, Card, Logo, TextField, useTheme, useToast } from '@soteria-forge/ui';
import { Screen } from '../components';
import { useAuth, isSupabaseConfigured } from '../auth';

/**
 * Accept either a raw invite token or a pasted invite link and return the token.
 *
 * The token is a UUID. We support:
 *   - a bare token (possibly wrapped in whitespace): returned as-is;
 *   - a URL/deep-link carrying it in a query param (`invite`, `token`,
 *     `invite_token`, `code`) — the most common share format;
 *   - a URL whose LAST path segment is the token (e.g. `.../invite/<uuid>`).
 *
 * IMPORTANT: this is a convenience parser for the field the user pastes, NOT a
 * trust boundary. The extracted token is still verified server-side by
 * `redeem_invitation` (against the caller's email); a bad token just fails. We
 * never read a tenant_id from the link — only the invite token.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_QUERY_KEYS = ['invite_token', 'invite', 'token', 'code'] as const;

export function extractInviteToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Looks like a URL (has a scheme or a query string) → try to pull the token out.
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.includes('?');
  if (looksLikeUrl) {
    try {
      // react-native-url-polyfill (loaded app-wide) provides WHATWG URL on RN.
      const url = new URL(trimmed);
      for (const key of TOKEN_QUERY_KEYS) {
        const value = url.searchParams.get(key);
        if (value && value.trim()) return value.trim();
      }
      // Fall back to the last non-empty path segment (e.g. /invite/<uuid>).
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last) return decodeURIComponent(last).trim();
    } catch {
      // Not a parseable URL after all — fall through to treating it as a token.
    }
  }

  return trimmed;
}

export function JoinTenantScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { user, status, redeemInvitation, signOut } = useAuth();

  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const backendReady = isSupabaseConfigured;
  const token = extractInviteToken(raw);
  // A valid invite token is a UUID; gate the button on that so we don't fire an
  // RPC we know will fail. (The server is still the authority — this is UX only.)
  const tokenLooksValid = UUID_RE.test(token);

  const onSubmit = async () => {
    if (submitting) return;
    setFieldError(null);

    if (!token) {
      setFieldError('Paste your invite code or invite link to continue.');
      return;
    }
    if (!tokenLooksValid) {
      setFieldError('That doesn’t look like a valid invite. Check the code or link and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await redeemInvitation(token);
      if (result.ok) {
        // On success the auth status flips to `authenticated`; the route guard
        // moves the user into the app. We just confirm here.
        toast('You’re in — welcome to your team.', { type: 'success' });
      } else {
        const message = result.error ?? 'That invite could not be redeemed.';
        setFieldError(message);
        toast(message, { type: 'danger' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Show whose session this is, so the user knows the invite must match THIS
  // email. `user` is null in `needs-profile` (no profile yet), so fall back to
  // the status for messaging rather than a fabricated identity.
  const emailHint = user?.email;

  const noteStyle: TextStyle = {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Logo size={64} />
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 28,
            letterSpacing: 0.4,
            textAlign: 'center',
          }}
        >
          Join your team
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 21,
          }}
        >
          You’re signed in{emailHint ? ` as ${emailHint}` : ''}, but you haven’t joined an
          organization yet. Enter the invite your administrator sent you to get started.
        </Text>
      </View>

      <Card>
        <View style={styles.form}>
          <TextField
            label="Invite code or link"
            placeholder="Paste your invite code or link"
            value={raw}
            onChangeText={(v) => {
              setRaw(v);
              if (fieldError) setFieldError(null);
            }}
            autoCapitalize="none"
            multiline
            errorText={fieldError ?? undefined}
            helperText={
              !fieldError
                ? 'Your invite is tied to your email — it only works for this account.'
                : undefined
            }
          />

          <Button
            title="Join team"
            onPress={onSubmit}
            fullWidth
            loading={submitting}
            disabled={!backendReady || !token}
          />

          {!backendReady ? (
            <Text style={noteStyle}>
              Backend not configured — set EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY (copy .env.example to .env) to enable joining.
            </Text>
          ) : (
            <Text style={noteStyle}>
              Don’t have an invite? Ask your training administrator to send you one.
            </Text>
          )}
        </View>
      </Card>

      {/* Escape hatch: a user on the wrong account can sign out and try another. */}
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() => void signOut()}
        disabled={status === 'loading'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: 28 },
  header: { gap: 12, alignItems: 'center' },
  form: { gap: 16 },
});
