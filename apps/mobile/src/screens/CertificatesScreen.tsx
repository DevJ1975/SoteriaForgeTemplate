/**
 * CertificatesScreen — "My Certificates": the learner's earned certificates.
 *
 * Reads the caller's OWN certificates via `useCertificates()` (RLS-scoped,
 * owner-only — the server returns only this user's certificates in this tenant;
 * the client sends no identity for authorization) and renders each with the kit's
 * branded `Certificate` (through `CertificateView`). Identity for the recipient
 * name comes from the verified session (`useAuth`), never from the certificate
 * row. Empty/loading/error/backend-pending states all degrade cleanly.
 *
 * Colour/type come from `useTheme()` tokens; no hardcoded brand hex.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, BadgeGlyph, Button, Card, Divider, Skeleton, useTheme } from '@soteria-forge/ui';
import { CertificateView, Screen } from '../components';
import { useAuth } from '../auth';
import { useCertificates } from '../api';

export function CertificatesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { certificates, loading, backendPending, error, refetch } = useCertificates();

  // Re-read on focus so a certificate earned while away appears without a manual
  // refresh (it's issued server-side when the enrollment completes).
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Pull-to-refresh keeps the loaded list on screen (the skeleton state below
  // is only for the initial load); the spinner clears when loading settles.
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const recipientName = user
    ? user.displayName ?? user.email ?? user.username
    : 'Recipient';

  if (loading && !refreshing) {
    // Skeletons shaped like the loaded layout: title row + certificate blocks.
    return (
      <Screen scroll={false}>
        <View style={styles.header}>
          <Skeleton variant="line" height={24} width={180} />
          <Skeleton variant="line" height={20} width={36} radius="pill" />
        </View>
        <View style={{ gap: 18 }}>
          <View style={styles.certBlock}>
            <Skeleton variant="line" height={16} width="64%" />
            <Skeleton variant="block" height={220} radius="lg" />
          </View>
          <View style={styles.certBlock}>
            <Skeleton variant="line" height={16} width="52%" />
            <Skeleton variant="block" height={220} radius="lg" />
          </View>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              color: theme.colors.danger,
              fontFamily: theme.fonts.body,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {error}
          </Text>
          <Button title="Retry" variant="secondary" size="sm" onPress={refetch} />
        </Card>
      </Screen>
    );
  }

  // Empty state — no certificates yet (or backend not configured). Never faked.
  if (certificates.length === 0) {
    return (
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <View style={styles.header}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 26,
            }}
          >
            My Certificates
          </Text>
        </View>
        <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 28 }}>
          {/* Kit medal glyph in a locked/neutral tone — no emoji. */}
          <BadgeGlyph name="medal" size={34} color={theme.colors.textMuted} />
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 18,
              marginTop: 6,
            }}
          >
            No certificates yet
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            {backendPending
              ? 'Your certificates appear here once your organization’s training is connected.'
              : 'Finish an assigned course to earn your first certificate — it’ll show up here automatically.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.header}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 26,
          }}
        >
          My Certificates
        </Text>
        <Badge label={`${certificates.length}`} tone="success" />
      </View>

      {certificates.map((cert, i) => (
        <View key={cert.id} style={styles.certBlock}>
          <View style={styles.certMeta}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.display,
                fontWeight: '600',
                fontSize: 16,
                flex: 1,
              }}
              numberOfLines={2}
            >
              {cert.courseTitle}
            </Text>
            <Badge label={cert.certificateNumber} tone="neutral" />
          </View>
          <CertificateView certificate={cert} recipientName={recipientName} />
          {i < certificates.length - 1 ? <Divider spacing={18} /> : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  certBlock: { gap: 12 },
  certMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
