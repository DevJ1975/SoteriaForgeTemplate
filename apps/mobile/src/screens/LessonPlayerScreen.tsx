/**
 * LessonPlayerScreen — plays one lesson and CLOSES THE LEARNING LOOP.
 *
 * A worker opens a lesson from the course detail, works through it, and taps
 * "Mark complete". That tap builds an append-only xAPI COMPLETION statement and
 * enqueues it through the proven offline-first outbox (`CompletionQueue.enqueue`)
 * — never a direct Supabase insert. The queue is idempotent by the client UUID
 * and the sync engine drains it to the live `completion_statements` table when
 * connectivity allows; a server `AFTER INSERT` trigger then reads the statement's
 * `context.{course_id,lesson_id}` and recomputes the enrollment's progress.
 *
 * INVARIANTS enforced here:
 *   - tenantId + userId + the actor name come ONLY from the verified session
 *     (`useAuth`), NEVER from the route param or any other input. The only thing
 *     taken from the route is the opaque lesson id, which RLS scopes to the
 *     caller's tenant on read.
 *   - The statement is APPEND-ONLY (built with the shared `createCompletionStatement`,
 *     enqueued once, never updated/deleted) and idempotent by its client UUID.
 *   - `context` is EXACTLY `{ course_id, lesson_id }` — the shape the server
 *     progress trigger depends on. `verb` is `xapiVerbs.completed`.
 *   - Works offline: the enqueue is a local SQLite write; the OfflineBanner shows
 *     the pending-sync count. We optimistically flip the lesson to complete and
 *     navigate back so the course detail re-reads the local outbox and advances
 *     its progress bar without waiting for the network.
 *
 * Rendering is a themed placeholder body (video = a play surface + description;
 * reflection/quiz/document = the description + a prompt). No hardcoded brand hex.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  generateStatementId,
  xapiVerbs,
  type XapiObject,
} from '@soteria-forge/shared';
import { Badge, Button, Card, Chip, Divider, ProgressBar, useTheme } from '@soteria-forge/ui';
import { Screen } from '../components';
import { useAuth } from '../auth';
import { useLesson, type LessonDetail } from '../api';
import { completionQueue } from '../offline';

/** Human label + prompt for each lesson kind's placeholder body. */
function bodyCopy(kind: LessonDetail['kind']): { label: string; prompt: string } {
  switch (kind) {
    case 'video':
      return {
        label: 'Video',
        prompt:
          'Watch the full clip, then mark the lesson complete to record your progress.',
      };
    case 'quiz':
      return {
        label: 'Quiz',
        prompt:
          'Answer each question, then mark the lesson complete to submit your attempt.',
      };
    case 'reflection':
      return {
        label: 'Reflection',
        prompt:
          'Think through the prompt and how it applies on your site, then mark complete.',
      };
    case 'document':
      return {
        label: 'Document',
        prompt: 'Read the material end to end, then mark the lesson complete.',
      };
    case 'practical-signoff':
      return {
        label: 'Practical sign-off',
        prompt:
          'Complete the hands-on task with your supervisor, then mark it complete.',
      };
    default:
      return {
        label: 'Lesson',
        prompt: 'Work through the lesson, then mark it complete.',
      };
  }
}

export function LessonPlayerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lesson, loading, backendPending, error, refetch } = useLesson(id);

  // Local "just completed" flag so the button + badge flip instantly on tap,
  // even before we navigate back (the course detail then reads the outbox).
  const [justCompleted, setJustCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
          Loading lesson…
        </Text>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Notice tone="danger" text={error} actionLabel="Retry" onAction={refetch} />
      </Screen>
    );
  }

  if (backendPending) {
    return (
      <Screen>
        <Notice text="Lessons load once the app is connected to Supabase." />
      </Screen>
    );
  }

  if (!lesson) {
    return (
      <Screen>
        <Notice text="Lesson not found in your organization." />
      </Screen>
    );
  }

  const isComplete = lesson.completed || justCompleted;
  const copy = bodyCopy(lesson.kind);

  const onMarkComplete = async () => {
    // Guard: identity MUST come from the verified session, never route input.
    if (!user) {
      setSubmitError('Your session expired. Sign in again to record completion.');
      return;
    }
    if (isComplete || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    // Mint the client UUID up front so it IS the idempotency key (a retry reuses
    // the same id → the enqueue and the server upsert both no-op on a duplicate).
    const statementId = generateStatementId();

    const actorName = user.displayName ?? user.email ?? user.username;
    const object: XapiObject = {
      id: `lesson:${lesson.id}`,
      definition: {
        name: { 'en-US': lesson.title },
        type: 'http://adlnet.gov/expapi/activities/lesson',
      },
    };

    try {
      await completionQueue.enqueue({
        id: statementId,
        // tenantId + userId come ONLY from the verified session.
        tenantId: user.tenantId,
        userId: user.userId,
        actor: { name: actorName },
        verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
        object,
        result: { completion: true },
        // EXACTLY { course_id, lesson_id } — the server progress trigger reads this.
        context: { course_id: lesson.courseId, lesson_id: lesson.id },
      });

      // Optimistically reflect completion and go back; the course detail re-reads
      // the local outbox on focus and advances its progress bar. This works fully
      // offline — the write is local SQLite and the OfflineBanner shows it pending.
      setJustCompleted(true);
      router.back();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not record completion. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Card raised>
        <View style={styles.headerTop}>
          <Chip label={copy.label} />
          {isComplete ? <Badge label="Completed" tone="success" /> : null}
        </View>

        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 24,
            marginTop: 10,
          }}
        >
          {lesson.title}
        </Text>

        <View style={styles.metaRow}>
          {lesson.durationMinutes > 0 ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 13,
              }}
            >
              {lesson.durationMinutes} min
            </Text>
          ) : null}
          {lesson.required ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 13,
              }}
            >
              Required
            </Text>
          ) : null}
        </View>
      </Card>

      {/* Play surface — video lessons get a themed placeholder; other kinds skip
          it. VideoAsset holds metadata only; a real signed playback URL is
          resolved server-side (left as the documented video seam). */}
      {lesson.kind === 'video' ? (
        <View
          style={[
            styles.playerPlaceholder,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.md,
            },
          ]}
        >
          <View
            style={[styles.playGlyph, { borderColor: theme.colors.primary }]}
            accessibilityLabel="Play"
          >
            <Text style={{ color: theme.colors.primary, fontSize: 22, marginLeft: 3 }}>▶</Text>
          </View>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 13,
              marginTop: 10,
            }}
          >
            Lesson video plays here
          </Text>
        </View>
      ) : null}

      <Card>
        {lesson.description ? (
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {lesson.description}
          </Text>
        ) : (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            No description for this lesson yet.
          </Text>
        )}

        <Divider spacing={14} />

        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {copy.prompt}
        </Text>
      </Card>

      {submitError ? (
        <Notice tone="danger" text={submitError} />
      ) : null}

      <Button
        title={isComplete ? 'Completed' : 'Mark complete'}
        fullWidth
        disabled={isComplete}
        loading={submitting}
        onPress={onMarkComplete}
      />
    </Screen>
  );
}

/** Themed notice card for error / pending / not-found / submit-error states. */
function Notice({
  text,
  tone,
  actionLabel,
  onAction,
}: {
  text: string;
  tone?: 'danger';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 10 }}>
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
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" size="sm" onPress={onAction} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  playerPlaceholder: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  playGlyph: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
