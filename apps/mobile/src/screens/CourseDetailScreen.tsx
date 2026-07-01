/**
 * CourseDetailScreen — a single course header for THIS tenant.
 *
 * Loads one course by id through the tenant-scoped data client. The lookup is
 * still tenant-scoped: `getCourse` targets the caller's own partition, and the
 * server refuses the read if the course belongs to another tenant. A course id
 * from a deep link is therefore NOT a way to reach another tenant's data.
 *
 * Video playback (react-native-video against a tenant-authorized, on-demand
 * playback URL for the lesson's VideoAsset) is intentionally left as a marked
 * seam — VideoAsset holds metadata only; the signed URL is resolved server-side.
 *
 * Re-skinned on the @soteria-forge/ui kit: a header Card with a status Badge and
 * readiness ProgressBar, Tabs switching an Overview panel and an Accordion of
 * modules -> lessons, a primary "Continue" Button, and — when the course reads
 * as complete — an AchievementBadge + a prop-driven Certificate. The
 * getDataClient(tenantId).getCourse(id) call, the [id] param, and every state
 * are preserved. No hardcoded brand hex.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { CourseRecord } from '@soteria-forge/shared';
import {
  Accordion,
  AchievementBadge,
  Badge,
  Button,
  Card,
  Certificate,
  Chip,
  Divider,
  ProgressBar,
  Tabs,
  useTheme,
} from '@soteria-forge/ui';
import { Screen } from '../components';
import { getDataClient, BackendNotConfiguredError } from '../api';
import { useTenantId } from '../auth/AuthProvider';
import { useAuth } from '../auth';

export function CourseDetailScreen() {
  const theme = useTheme();
  const tenantId = useTenantId();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'modules'>('overview');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setBackendPending(false);
    try {
      // Tenant-scoped by construction: the client is bound to the verified
      // tenantId, so an id from a deep link can only resolve within this tenant.
      const client = getDataClient(tenantId);
      setCourse(await client.getCourse(id));
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        setBackendPending(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load course');
      }
    } finally {
      setLoading(false);
    }
  }, [id, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ProgressBar value={0.4} style={{ width: 160 }} />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            marginTop: 12,
          }}
        >
          Loading course…
        </Text>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Notice tone="danger" text={error} />
      </Screen>
    );
  }

  if (backendPending) {
    return (
      <Screen>
        <Notice text="Course details load once the app is connected to Supabase." />
      </Screen>
    );
  }

  if (!course) {
    return (
      <Screen>
        <Notice text="Course not found in your organization." />
      </Screen>
    );
  }

  const progress = Math.min(1, Math.max(0, course.fieldReadinessScore / 100));
  const completed = course.fieldReadinessScore >= 100;

  return (
    <Screen>
      {/* Header card */}
      <Card raised>
        <View style={styles.headerTop}>
          <Badge label={completed ? 'Certified' : 'In progress'} tone={completed ? 'success' : 'primary'} />
          {course.durationMinutes ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 13,
              }}
            >
              {course.durationMinutes} min
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 26,
            marginTop: 8,
          }}
        >
          {course.title}
        </Text>
        {course.description ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 15,
              lineHeight: 22,
              marginTop: 8,
            }}
          >
            {course.description}
          </Text>
        ) : null}

        <View style={styles.progressRow}>
          <ProgressBar value={progress} height={10} style={{ flex: 1 }} />
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 15,
              width: 44,
              textAlign: 'right',
            }}
          >
            {Math.round(progress * 100)}%
          </Text>
        </View>

        <Divider spacing={16} />
        <Button title={completed ? 'Review course' : 'Continue'} fullWidth onPress={() => {}} />
      </Card>

      {/* Tabs: Overview / Modules */}
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'overview' | 'modules')}
        items={[
          { label: 'Overview', value: 'overview' },
          { label: 'Modules', value: 'modules' },
        ]}
      />

      {tab === 'overview' ? (
        <View style={styles.panel}>
          {course.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {course.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          ) : null}

          {course.certificateLabel ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              On completion you earn: {course.certificateLabel}
            </Text>
          ) : null}

          {/* Video player seam: a lesson's VideoAsset plays here via
              react-native-video against a server-resolved, tenant-authorized
              signed playback URL. VideoAsset stores metadata only — never bytes. */}
          <View
            style={[
              styles.playerPlaceholder,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.md },
            ]}
          >
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 14,
              }}
            >
              Lesson video appears here
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.panel}>
          {/* Modules -> lessons. The tenant-scoped data client currently returns
              only the course header (no listModules seam yet), so the accordion
              renders the course's structure placeholders. Once getCourse returns
              modules/lessons, map them straight onto these Accordion items. */}
          <Accordion
            defaultOpen={[0]}
            items={[
              {
                title: 'Course modules',
                content:
                  'Module and lesson detail loads with the course once the AppSync backend exposes them. Each module will list its lessons here with per-lesson progress.',
              },
              {
                title: 'What you’ll be signed off on',
                content: course.certificateLabel
                  ? `Completion is recorded as an append-only xAPI statement and issues: ${course.certificateLabel}.`
                  : 'Completion is recorded as an append-only xAPI statement, keyed by a client-generated UUID for idempotent sync.',
              },
            ]}
          />
        </View>
      )}

      {/* Completed treatment: badge + certificate */}
      {completed ? (
        <View style={styles.panel}>
          <View style={{ alignItems: 'center' }}>
            <AchievementBadge
              tier="gold"
              icon="grad"
              shape="rosette"
              size={104}
              label="Course Complete"
              sublabel={course.certificateLabel ?? 'Certified'}
            />
          </View>
          <Certificate
            recipientName={user?.displayName ?? user?.email ?? 'Recipient'}
            courseName={course.title}
            completionDate={new Date(course.updatedAt).toLocaleDateString()}
            score={`${Math.round(progress * 100)}%`}
            certId={`SF-${course.id.slice(0, 8).toUpperCase()}`}
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** Simple themed notice card for the error / pending / not-found states. */
function Notice({ text, tone }: { text: string; tone?: 'danger' }) {
  const theme = useTheme();
  return (
    <Card>
      <Text
        style={{
          color: tone === 'danger' ? theme.colors.danger : theme.colors.textMuted,
          fontFamily: theme.fonts.body,
          fontSize: 15,
          lineHeight: 22,
        }}
      >
        {text}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  panel: { gap: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerPlaceholder: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
