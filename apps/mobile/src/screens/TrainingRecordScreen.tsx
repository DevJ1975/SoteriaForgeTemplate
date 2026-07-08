/**
 * TrainingRecordScreen — "My Training Record" (#15a): every completion this
 * learner has recorded ON THIS DEVICE, with its live sync status.
 *
 * SOURCE: the offline read-model + retry hook `useTrainingRecord(userId)`
 * (owned by offline-sync; consumed here as a seam). It subscribes to the
 * append-only local outbox and re-projects on every enqueue / sync / retry, so
 * the list stays live as statements drain in the background — and, crucially,
 * an OFFLINE worker still SEES their queued completions here. `userId` is the
 * VERIFIED session auth id (`useAuth().user.userId`), never user input; reads
 * are identity-fenced by that id locally and by Postgres RLS on the server.
 *
 * Each row shows WHAT (verb + lesson/course, with the course title resolved
 * best-effort from the local catalog cache), WHEN, and a status chip:
 *   - Synced (success)         — the server has accepted it.
 *   - Waiting to sync (info)   — fresh or transiently failed; it drains on its own.
 *   - Needs attention (danger) — the server permanently refused it; a Retry
 *     action re-arms the row locally and kicks `syncEngine.syncNow()` (both via
 *     the hook — same client UUID, idempotent, never mutates the server row).
 *
 * FIVE states: loading (skeleton), empty ("no training recorded yet"), error
 * (the local store could not be opened — Try again), offline (renders local
 * entries + a note; the global OfflineBanner is in <Screen>), and content.
 *
 * Colour/type come from `useTheme()` tokens; no hardcoded brand hex.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { xapiVerbs } from '@soteria-forge/shared';
import {
  Badge,
  BadgeGlyph,
  Button,
  Card,
  Divider,
  Skeleton,
  StatTile,
  useTheme,
  useToast,
  type BadgeTone,
} from '@soteria-forge/ui';
import { Screen } from '../components';
import { useAuth } from '../auth';
import {
  useTrainingRecord,
  useConnectivityOptional,
  completionQueue,
  localCourseStore,
  type CompletionRecordEntry,
  type CompletionRecordStatus,
} from '../offline';

/** Display metadata for each sync status — label + branded tone (no hex). */
const STATUS_META: Record<CompletionRecordStatus, { label: string; tone: BadgeTone }> = {
  synced: { label: 'Synced', tone: 'success' },
  waiting: { label: 'Waiting to sync', tone: 'info' },
  'needs-attention': { label: 'Needs attention', tone: 'danger' },
};

/** Human verb for the WHAT line. Falls back to the IRI's last segment. */
function verbLabel(verbId: string): string {
  switch (verbId) {
    case xapiVerbs.completed:
      return 'Completed';
    case xapiVerbs.passed:
      return 'Passed';
    case xapiVerbs.failed:
      return 'Failed';
    default: {
      const seg = verbId.split('/').filter(Boolean).pop() ?? 'Recorded';
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    }
  }
}

/** The subject noun a row is about, from the denormalized context ids. */
function subjectNoun(entry: CompletionRecordEntry): string {
  if (entry.lessonId) return 'a lesson';
  if (entry.courseId) return 'a course';
  return 'an activity';
}

/** Friendly WHEN, resilient to a malformed timestamp (falls back to the raw). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const date = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

interface RecordRowProps {
  entry: CompletionRecordEntry;
  courseTitle?: string;
  retrying: boolean;
  onRetry: (statementId: string) => void;
}

function RecordRow({ entry, courseTitle, retrying, onRetry }: RecordRowProps) {
  const theme = useTheme();
  const meta = STATUS_META[entry.status];
  const needsAttention = entry.status === 'needs-attention';

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.rowTop}>
        <View style={styles.rowMain}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 16,
            }}
            numberOfLines={2}
          >
            {`${verbLabel(entry.verbId)} ${subjectNoun(entry)}`}
          </Text>
          {courseTitle ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 13,
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {courseTitle}
            </Text>
          ) : null}
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 12,
            }}
          >
            {formatWhen(entry.timestamp)}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      {needsAttention ? (
        <>
          <Divider spacing={4} />
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            This completion was rejected during sync. Retry to send it again — it keeps the same
            record, so it can never be counted twice.
          </Text>
          <Button
            title={retrying ? 'Retrying…' : 'Retry sync'}
            variant="secondary"
            size="sm"
            disabled={retrying}
            onPress={() => onRetry(entry.statementId)}
          />
        </>
      ) : null}
    </Card>
  );
}

export function TrainingRecordScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  // VERIFIED session id — the identity fence for every read below.
  const userId = user?.userId ?? null;
  const tenantId = user?.tenantId ?? null;

  const { entries, loading, retry, refresh } = useTrainingRecord(userId);
  const { isOnline } = useConnectivityOptional();

  // Best-effort course titles from the LOCAL catalog cache (tenant-scoped by the
  // verified tenantId; RLS already scoped what landed in the cache). Optional —
  // if the store is empty/unavailable the rows simply render without a title.
  const [courseTitles, setCourseTitles] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!tenantId) {
      setCourseTitles(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const courses = await localCourseStore.listCourses(tenantId);
        if (!cancelled) setCourseTitles(new Map(courses.map((c) => [c.id, c.title])));
      } catch {
        if (!cancelled) setCourseTitles(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Probe the local store once so we can tell "no completions yet" (empty) apart
  // from "the store could not be opened" (error) — the read hook degrades both
  // to an empty, non-loading list by design, so this restores the distinction.
  const [storeError, setStoreError] = useState(false);
  const [probing, setProbing] = useState(true);
  const probe = useCallback(async () => {
    if (!userId) {
      setStoreError(false);
      setProbing(false);
      return;
    }
    setProbing(true);
    try {
      await completionQueue.recordEntries(userId);
      setStoreError(false);
    } catch {
      setStoreError(true);
    } finally {
      setProbing(false);
    }
  }, [userId]);
  useEffect(() => {
    void probe();
  }, [probe]);

  // In-flight retries, so each row's button can show its own spinner/disabled.
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const onRetry = useCallback(
    async (statementId: string) => {
      setRetrying((prev) => new Set(prev).add(statementId));
      try {
        await retry(statementId);
        toast(
          isOnline ? 'Retrying sync…' : 'Re-queued — will sync when you’re back online',
          { type: isOnline ? 'info' : 'default' },
        );
      } catch {
        toast('Couldn’t retry right now. Please try again.', { type: 'danger' });
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(statementId);
          return next;
        });
      }
    },
    [retry, toast, isOnline],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), probe()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, probe]);

  const counts = useMemo(() => {
    let synced = 0;
    let attention = 0;
    for (const e of entries) {
      if (e.status === 'synced') synced += 1;
      else if (e.status === 'needs-attention') attention += 1;
    }
    return { total: entries.length, synced, attention };
  }, [entries]);

  const Header = (
    <View style={styles.header}>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 26,
        }}
      >
        My Training Record
      </Text>
    </View>
  );

  // No verified identity — the (app) guard normally prevents this; render nothing.
  if (!user) return null;

  // LOADING — initial projection/probe with nothing to show yet.
  if ((loading || probing) && entries.length === 0 && !storeError) {
    return (
      <Screen scroll={false}>
        {Header}
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton variant="line" height={16} width="62%" />
              <Skeleton variant="line" height={12} width="40%" />
              <Skeleton variant="line" height={20} width={110} radius="pill" />
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  // ERROR — the local store could not be opened (and we have nothing cached to
  // show). Distinct from empty; offers a retry.
  if (storeError && entries.length === 0) {
    return (
      <Screen>
        {Header}
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
          <BadgeGlyph name="shield" size={30} color={theme.colors.danger} />
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 18,
              textAlign: 'center',
            }}
          >
            Couldn’t open your training record
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
            Your on-device training store didn’t load. Nothing was lost — try again.
          </Text>
          <Button title="Try again" variant="secondary" size="sm" onPress={() => void probe()} />
        </Card>
      </Screen>
    );
  }

  // EMPTY — no completions recorded on this device yet.
  if (entries.length === 0) {
    return (
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {Header}
        <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 28 }}>
          <BadgeGlyph name="target" size={34} color={theme.colors.textMuted} />
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 18,
              marginTop: 6,
            }}
          >
            No training recorded yet
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
            Finish a lesson and it’ll appear here — even offline. Completions sync automatically
            when you’re back online.
          </Text>
        </Card>
      </Screen>
    );
  }

  // CONTENT (+ OFFLINE note). The global OfflineBanner is rendered by <Screen>.
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {Header}

      {/* Summary — derived purely from the local entries; never faked. */}
      <View style={styles.kpiRow}>
        <StatTile value={counts.total} label="Recorded" />
        <StatTile value={counts.synced} label="Synced" accent={theme.colors.success} />
        <StatTile
          value={counts.attention}
          label="Attention"
          accent={counts.attention > 0 ? theme.colors.danger : undefined}
        />
      </View>

      {!isOnline ? (
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          You’re offline. These are saved on this device and will sync when you reconnect.
        </Text>
      ) : null}

      {entries.map((entry) => (
        <RecordRow
          key={entry.statementId}
          entry={entry}
          courseTitle={entry.courseId ? courseTitles.get(entry.courseId) : undefined}
          retrying={retrying.has(entry.statementId)}
          onRetry={onRetry}
        />
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
  kpiRow: { flexDirection: 'row', gap: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rowMain: { flex: 1, gap: 4 },
  skeletonCard: { gap: 10, padding: 16 },
});
