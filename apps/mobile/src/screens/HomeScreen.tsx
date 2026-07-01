/**
 * HomeScreen — tenant-aware landing for a signed-in learner.
 *
 * The greeting and every downstream data read are scoped to the VERIFIED
 * tenantId from the token (via useAuth). Nothing here trusts client-supplied
 * tenancy. Groups drive which affordances show (e.g. supervisors get a team
 * entry point) — again straight from the token claim.
 *
 * Re-skinned on the @soteria-forge/ui kit: an Avatar + greeting header, a row of
 * StatTile KPIs (assigned / complete / overdue), a ProgressBar of overall
 * readiness, and AchievementBadges for the learner's streak/certification. KPIs
 * derive from the tenant-scoped `useCourses()` hook — the SAME data the course
 * list reads, so nothing here invents cross-tenant numbers. Colour/type come
 * from useTheme() tokens; no hardcoded brand hex.
 */
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
import { Screen } from '../components';
import { useAuth } from '../auth';
import { useCourses, useCertificates } from '../api';

export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  // Tenant-scoped by construction (bound to the verified tenantId inside the
  // hook). Drives the readiness KPIs below.
  const { courses, backendPending } = useCourses();
  // The learner's earned certificates (RLS-scoped, owner-only) — drives the
  // "My Certificates" Home affordance count.
  const { certificates } = useCertificates();

  if (!user) return null;

  const displayName = user.displayName ?? user.email ?? user.username;
  const firstName = displayName.split(' ')[0];
  const isSupervisor = hasMinimumGroup(user.groups, 'supervisor');

  // Overall readiness across this tenant's catalog. Until enrollment data is
  // wired we derive readiness from the course fieldReadinessScore (0..100);
  // with no courses yet (backend undeployed) everything reads as zero rather
  // than faking progress.
  // "assigned / complete / in-progress" KPIs. We intentionally show in-progress
  // rather than "overdue": overdue requires per-enrollment due dates, which the
  // header-only course record doesn't carry — surfacing a fake overdue count
  // would be misleading. Swap this third tile to overdue once enrollment
  // dueAt/status is wired through the data client.
  const assigned = courses.length;
  const complete = courses.filter((c) => c.fieldReadinessScore >= 100).length;
  const inProgress = courses.filter(
    (c) => c.fieldReadinessScore > 0 && c.fieldReadinessScore < 100,
  ).length;
  const readiness =
    assigned > 0
      ? courses.reduce((sum, c) => sum + Math.min(100, Math.max(0, c.fieldReadinessScore)), 0) /
        assigned /
        100
      : 0;
  const readinessPct = Math.round(readiness * 100);

  return (
    <Screen>
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

      {/* KPI row — assigned / complete / overdue for THIS tenant */}
      <View style={styles.kpiRow}>
        <StatTile value={assigned} label="Assigned" />
        <StatTile value={complete} label="Complete" accent={theme.colors.success} />
        <StatTile value={inProgress} label="In progress" accent={theme.colors.warning} />
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
              ? 'No training has been assigned to your organization yet.'
              : 'Keep going — finish your assigned modules to reach full field readiness.'}
        </Text>
        <Divider spacing={16} />
        <Button
          title="Continue training"
          fullWidth
          onPress={() => router.push('/(app)/(tabs)/courses')}
        />
      </Card>

      {/* Achievements */}
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
          label="7-Day Streak"
          sublabel="On-shift daily"
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
