/**
 * HomeScreen — tenant-aware landing for a signed-in learner.
 *
 * The greeting and every downstream data read are scoped to the VERIFIED
 * tenantId from the token (via useAuth). Nothing here trusts client-supplied
 * tenancy. Groups drive which affordances show (e.g. supervisors get a team
 * entry point) — again straight from the token claim.
 *
 * HONEST KPIs: assigned / complete / overdue and the overall-readiness bar all
 * derive from the learner's OWN enrollments (`useEnrollments`), whose
 * `progress` is computed server-side from their real completion statements —
 * never from `course.fieldReadinessScore`, which is a static authoring-time
 * field (a fresh worker must read 0%, not the catalog's ambition). Achievement
 * badges are likewise derived from those same numbers — nothing decorative is
 * hardcoded. Colour/type come from useTheme() tokens; no hardcoded brand hex.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hasMinimumGroup } from '@soteria-forge/shared';
import {
  AchievementBadge,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ProgressBar,
  StatTile,
  useTheme,
} from '@soteria-forge/ui';
import { AppearanceToggle, Screen } from '../components';
import { useAuth } from '../auth';
import { useEnrollments, useCertificates } from '../api';

export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  // The learner's OWN enrollments (RLS-scoped, owner-narrowed via the verified
  // session). Drives every KPI below with real progress numbers.
  const {
    enrollments,
    backendPending,
    loading: enrollmentsLoading,
    refetch: refetchEnrollments,
  } = useEnrollments();
  // The learner's earned certificates (RLS-scoped, owner-only) — drives the
  // "My Certificates" Home affordance count.
  const {
    certificates,
    loading: certificatesLoading,
    refetch: refetchCertificates,
  } = useCertificates();

  // Pull-to-refresh re-reads both owner-scoped sources; the spinner clears
  // once both hooks settle.
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!enrollmentsLoading && !certificatesLoading) setRefreshing(false);
  }, [enrollmentsLoading, certificatesLoading]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetchEnrollments();
    refetchCertificates();
  }, [refetchEnrollments, refetchCertificates]);

  if (!user) return null;

  const displayName = user.displayName ?? user.email ?? user.username;
  const firstName = displayName.split(' ')[0];
  const isSupervisor = hasMinimumGroup(user.groups, 'supervisor');

  // "assigned / complete / overdue" from the caller's real enrollments.
  // UNITS: enrollment.progress is the server's INTEGER PERCENT (0–100); the
  // ProgressBar takes the app-internal 0–1 fraction, so we divide by 100 here.
  const now = Date.now();
  const isComplete = (progress: number, status: string) =>
    status === 'completed' || progress >= 100;
  const assigned = enrollments.length;
  const complete = enrollments.filter((e) => isComplete(e.progress, e.status)).length;
  const overdue = enrollments.filter(
    (e) =>
      !isComplete(e.progress, e.status) &&
      (e.status === 'overdue' || (e.dueAt !== undefined && Date.parse(e.dueAt) < now)),
  ).length;
  const readiness =
    assigned > 0
      ? enrollments.reduce((sum, e) => sum + Math.min(100, Math.max(0, e.progress)), 0) /
        assigned /
        100
      : 0;
  const readinessPct = Math.round(readiness * 100);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {/* Greeting header — verified identity + tenant */}
      <View style={styles.header}>
        <Avatar name={displayName} size={52} status="online" ringColor={theme.colors.bg} />
        <View style={styles.headerText}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 13,
              letterSpacing: 0.3,
            }}
          >
            WELCOME BACK
          </Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 26,
            }}
          >
            {firstName}
          </Text>
          <View style={styles.tenantRow}>
            <Badge label={user.tenantId} tone="neutral" />
            {isSupervisor ? <Badge label="Supervisor" tone="info" /> : null}
          </View>
        </View>
      </View>

      {/* KPI row — the learner's own assigned / complete / overdue. Grouped
          for screen readers: one focusable summary instead of three stops. */}
      <View
        accessible
        accessibilityLabel={`Training summary: ${assigned} assigned, ${complete} complete, ${overdue} overdue`}
        style={styles.kpiRow}
      >
        <StatTile value={assigned} label="Assigned" />
        <StatTile value={complete} label="Complete" accent={theme.colors.success} />
        <StatTile value={overdue} label="Overdue" accent={theme.colors.warning} />
      </View>

      {/* Overall readiness */}
      <Card>
        <View style={styles.readinessHeader}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 18,
            }}
          >
            Overall readiness
          </Text>
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 20,
            }}
          >
            {readinessPct}%
          </Text>
        </View>
        <ProgressBar value={readiness} height={10} style={{ marginTop: 12 }} />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            marginTop: 10,
          }}
        >
          {backendPending
            ? 'Your field-readiness score appears once your organization’s training is deployed.'
            : assigned === 0
              ? 'No training has been assigned to you yet.'
              : 'Keep going — finish your assigned training to reach full field readiness.'}
        </Text>
        <Divider spacing={16} />
        <Button
          title="Continue training"
          fullWidth
          onPress={() => router.push('/(app)/(tabs)/courses')}
        />
      </Card>

      {/* Achievements — every badge is DERIVED from the learner's real
          enrollment numbers above (the decorative hardcoded streak is gone:
          the app tracks no daily-activity data, so it must not claim one). */}
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 12,
          letterSpacing: 3,
        }}
      >
        ACHIEVEMENTS
      </Text>
      <View style={styles.badgeRow}>
        <AchievementBadge
          tier="ember"
          icon="flame"
          shape="shield"
          size={92}
          locked={complete === 0 && readinessPct === 0}
          label="First Spark"
          sublabel={
            complete === 0 && readinessPct === 0 ? 'Start a lesson' : 'Training started'
          }
        />
        <AchievementBadge
          tier="gold"
          icon="trophy"
          shape="rosette"
          size={92}
          locked={complete === 0}
          label="Certified"
          sublabel={complete > 0 ? `${complete} course${complete === 1 ? '' : 's'}` : 'Finish a course'}
        />
        <AchievementBadge
          tier="silver"
          icon="safety"
          shape="hexagon"
          size={92}
          locked={readinessPct < 50}
          label="Safety Pro"
          sublabel={readinessPct < 50 ? 'Reach 50%' : 'Unlocked'}
        />
      </View>

      {/* My Certificates — a shortcut to the earned-certificates list. */}
      <Card>
        <View style={styles.readinessHeader}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 18,
            }}
          >
            My Certificates
          </Text>
          {certificates.length > 0 ? (
            <Badge label={`${certificates.length}`} tone="success" />
          ) : null}
        </View>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            marginTop: 8,
          }}
        >
          {certificates.length > 0
            ? 'View and share the certificates you’ve earned.'
            : 'Finish a course to earn your first certificate.'}
        </Text>
        <Divider spacing={16} />
        <Button
          title="View my certificates"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/(app)/certificates')}
        />
      </Card>

      {/* Appearance: light / dark / system, persisted across restarts. */}
      <AppearanceToggle />

      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1, gap: 3 },
  tenantRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  kpiRow: { flexDirection: 'row', gap: 12 },
  readinessHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgeRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
});
