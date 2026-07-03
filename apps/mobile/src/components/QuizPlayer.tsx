/**
 * QuizPlayer — the MVP quiz flow for a `quiz` lesson with authored questions.
 *
 * FLOW: render the parsed questions/choices → capture single-choice answers
 * (persisted to the local `quiz_state` table on every tap, so a killed app
 * resumes mid-quiz, fully offline) → score locally on submit → enforce the
 * lesson's passing score → emit an append-only xAPI statement with verb
 * `passed` or `failed`, `result.score` + `result.success`, through the SAME
 * offline outbox every completion uses. `passed` drives server enrollment
 * progress (migration 12 counts completed OR passed); `failed` is recorded but
 * never advances progress.
 *
 * IDEMPOTENCY (one attempt = one id, forever):
 *   - On submit, the statement's client UUID is pinned onto the quiz_state row
 *     BEFORE the statement is enqueued. A crash/double-tap in between re-uses
 *     the SAME id (the mount-time repair pass re-enqueues it; the queue and the
 *     server both dedupe on the UUID), so an attempt can never double-record.
 *   - A RETAKE after failure is a NEW attempt: resetAttempt clears the pinned
 *     id and the next submit mints a fresh UUID. Re-using the failed id would
 *     make the server silently drop the retake's `passed` statement.
 *
 * INVARIANTS: tenantId/userId/actor come ONLY from the verified session
 * (useAuth); context is EXACTLY { course_id, lesson_id } (the server progress
 * trigger's shape); statements are append-only — nothing here mutates one. No
 * hardcoded brand hex.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  generateStatementId,
  xapiVerbs,
  type XapiObject,
} from '@soteria-forge/shared';
import { Badge, Button, Card, Divider, useTheme, useToast } from '@soteria-forge/ui';
import { useAuth, type AuthUser } from '../auth';
import {
  scoreQuiz,
  resolvePassingScore,
  type LessonDetail,
  type QuizQuestion,
} from '../api';
import {
  completionQueue,
  quizStateStore,
  useConnectivityOptional,
  type QuizIdentity,
} from '../offline';
import * as haptics from '../lib/haptics';

export interface QuizPlayerProps {
  lesson: LessonDetail;
  /** True when this lesson is already known complete (e.g. from another device). */
  alreadyCompleted?: boolean;
  /** Invoked when the learner leaves after a recorded attempt. */
  onExit: () => void;
}

/**
 * Enqueue the attempt's statement through the append-only outbox. `id` pins the
 * client UUID minted (and persisted) at submit time — the enqueue and the
 * server upsert both dedupe on it.
 */
async function enqueueQuizResult(params: {
  id: string;
  user: AuthUser;
  lesson: LessonDetail;
  score: number;
  passed: boolean;
}): Promise<void> {
  const { id, user, lesson, score, passed } = params;
  const actorName = user.displayName ?? user.email ?? user.username;
  const object: XapiObject = {
    id: `lesson:${lesson.id}`,
    definition: {
      name: { 'en-US': lesson.title },
      type: 'http://adlnet.gov/expapi/activities/assessment',
    },
  };
  await completionQueue.enqueue({
    id,
    // tenantId + userId come ONLY from the verified session.
    tenantId: user.tenantId,
    userId: user.userId,
    actor: { name: actorName },
    verb: passed
      ? { id: xapiVerbs.passed, display: { 'en-US': 'passed' } }
      : { id: xapiVerbs.failed, display: { 'en-US': 'failed' } },
    object,
    result: {
      score: { raw: score, min: 0, max: 100, scaled: score / 100 },
      success: passed,
      // The attempt was carried through to the end either way; `success` is
      // what says whether the threshold was met.
      completion: true,
    },
    // EXACTLY { course_id, lesson_id } — the server progress trigger reads this.
    context: { course_id: lesson.courseId, lesson_id: lesson.id },
  });
}

type Phase = 'loading' | 'answering' | 'submitted';

export function QuizPlayer({ lesson, alreadyCompleted, onExit }: QuizPlayerProps) {
  const theme = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { isOnline } = useConnectivityOptional();

  const questions = lesson.content.questions;
  const passingScore = resolvePassingScore(lesson.passingScore, lesson.content.passingScore);

  const [phase, setPhase] = useState<Phase>('loading');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the attempt is recorded locally but its enqueue failed (rare). */
  const [recordError, setRecordError] = useState<string | null>(null);

  const identity: QuizIdentity | null = user
    ? {
        tenantId: user.tenantId,
        userId: user.userId,
        courseId: lesson.courseId,
        lessonId: lesson.id,
      }
    : null;

  // Hydrate stored state on mount: resume an in-progress attempt, or restore a
  // submitted result — repairing the outbox if the app died between the id pin
  // and the enqueue (same UUID → idempotent everywhere).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        if (active) setPhase('answering');
        return;
      }
      try {
        const snap = await quizStateStore.get(user.userId, lesson.id);
        if (!active) return;
        if (snap?.status === 'submitted' && typeof snap.score === 'number') {
          setAnswers(snap.answers);
          setScore(snap.score);
          setPhase('submitted');
          if (snap.completionStatementId) {
            try {
              const queued = await completionQueue.findByStatementId(
                snap.completionStatementId,
              );
              if (!queued) {
                await enqueueQuizResult({
                  id: snap.completionStatementId,
                  user,
                  lesson,
                  score: snap.score,
                  passed: snap.score >= passingScore,
                });
              }
            } catch {
              // Repair is best-effort; the result view's retry covers the rest.
            }
          }
        } else {
          if (snap) setAnswers(snap.answers);
          setPhase('answering');
        }
      } catch {
        // An unopenable local store must not block taking the quiz online.
        if (active) setPhase('answering');
      }
    })();
    return () => {
      active = false;
    };
    // Keyed by the attempt identity; lesson content is stable per lesson id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, lesson.id]);

  const onSelect = (questionId: string, choiceId: string) => {
    if (phase !== 'answering' || submitting) return;
    haptics.selection();
    const next = { ...answers, [questionId]: choiceId };
    setAnswers(next);
    // Fire-and-forget persistence — answering must never block on SQLite.
    if (identity) void quizStateStore.saveAnswers(identity, next).catch(() => {});
  };

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const allAnswered = answeredCount === questions.length;

  const onSubmit = async () => {
    // Identity MUST come from the verified session, never route input.
    if (!user || !identity) {
      setError('Your session expired. Sign in again to submit your attempt.');
      return;
    }
    if (phase !== 'answering' || submitting || !allAnswered) return;

    setSubmitting(true);
    setError(null);
    setRecordError(null);

    const { score: pct } = scoreQuiz(questions, answers);
    const passed = pct >= passingScore;

    try {
      // Pin the client UUID BEFORE enqueueing (crash-safe idempotency): if we
      // die between these two writes, the mount-time repair re-uses this id.
      const statementId = generateStatementId();
      await quizStateStore.markSubmitted(identity, {
        answers,
        score: pct,
        statementId,
      });
      setScore(pct);
      setPhase('submitted');

      try {
        await enqueueQuizResult({ id: statementId, user, lesson, score: pct, passed });
        if (passed) {
          haptics.success();
          toast(
            isOnline
              ? 'Quiz passed'
              : 'Quiz passed — will sync when you’re back online',
            { type: 'success' },
          );
        } else {
          haptics.error();
        }
      } catch (err) {
        haptics.error();
        setRecordError(
          err instanceof Error ? err.message : 'Could not record your attempt.',
        );
      }
    } catch (err) {
      haptics.error();
      setError(
        err instanceof Error ? err.message : 'Could not save your attempt. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Re-run the enqueue for an attempt whose statement failed to append. */
  const onRetryRecord = async () => {
    if (!user || score === null) return;
    setRecordError(null);
    try {
      const snap = await quizStateStore.get(user.userId, lesson.id);
      const pinnedId = snap?.completionStatementId;
      if (!pinnedId) throw new Error('No recorded attempt to retry.');
      await enqueueQuizResult({
        id: pinnedId, // the SAME pinned UUID — idempotent
        user,
        lesson,
        score,
        passed: score >= passingScore,
      });
    } catch (err) {
      setRecordError(
        err instanceof Error ? err.message : 'Could not record your attempt.',
      );
    }
  };

  /** A retake is a NEW attempt: cleared answers, and a NEW id on next submit. */
  const onRetake = async () => {
    if (user) {
      try {
        await quizStateStore.resetAttempt(user.userId, lesson.id);
      } catch {
        // Scratch-state reset failing must not trap the learner; proceed.
      }
    }
    setAnswers({});
    setScore(null);
    setError(null);
    setRecordError(null);
    setPhase('answering');
  };

  if (phase === 'loading') {
    return (
      <Card>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.body, fontSize: 14 }}>
          Loading your quiz…
        </Text>
      </Card>
    );
  }

  if (phase === 'submitted' && score !== null) {
    const passed = score >= passingScore;
    const { correct, total } = scoreQuiz(questions, answers);
    return (
      <Card raised>
        <View style={styles.resultHeader}>
          <Badge
            label={passed ? 'Passed' : 'Not passed'}
            tone={passed ? 'success' : 'danger'}
          />
          <Text
            style={{
              color: passed ? theme.colors.success : theme.colors.danger,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 32,
            }}
          >
            {score}%
          </Text>
        </View>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            marginTop: 8,
            lineHeight: 20,
          }}
        >
          {correct} of {total} correct · {passingScore}% needed to pass.{' '}
          {passed
            ? 'Your result is recorded and syncs automatically.'
            : 'Your attempt is recorded — review the material and try again.'}
        </Text>

        {recordError ? (
          <>
            <Divider spacing={14} />
            <Text
              style={{
                color: theme.colors.danger,
                fontFamily: theme.fonts.body,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {recordError}
            </Text>
            <View style={{ marginTop: 10 }}>
              <Button
                title="Retry saving result"
                variant="secondary"
                size="sm"
                onPress={() => void onRetryRecord()}
              />
            </View>
          </>
        ) : null}

        <Divider spacing={16} />
        {passed ? (
          <Button title="Back to course" fullWidth onPress={onExit} />
        ) : (
          <View style={{ gap: 10 }}>
            <Button title="Try again" fullWidth onPress={() => void onRetake()} />
            <Button title="Back to course" variant="ghost" fullWidth onPress={onExit} />
          </View>
        )}
      </Card>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {alreadyCompleted ? (
        <Card>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            You’ve already completed this lesson — a new attempt adds to your
            record and never reduces your progress.
          </Text>
        </Card>
      ) : null}

      {questions.map((q, index) => (
        <QuestionCard
          key={q.id}
          index={index}
          question={q}
          selectedChoiceId={answers[q.id]}
          onSelect={(choiceId) => onSelect(q.id, choiceId)}
        />
      ))}

      {error ? (
        <Card>
          <Text
            style={{
              color: theme.colors.danger,
              fontFamily: theme.fonts.body,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {error}
          </Text>
        </Card>
      ) : null}

      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.body,
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        {answeredCount} of {questions.length} answered · pass at {passingScore}%
      </Text>
      <Button
        title="Submit answers"
        fullWidth
        disabled={!allAnswered}
        loading={submitting}
        onPress={() => void onSubmit()}
      />
    </View>
  );
}

/** One question with its single-choice options (radio-style rows). */
function QuestionCard({
  index,
  question,
  selectedChoiceId,
  onSelect,
}: {
  index: number;
  question: QuizQuestion;
  selectedChoiceId: string | undefined;
  onSelect: (choiceId: string) => void;
}) {
  const theme = useTheme();
  return (
    <Card>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 12,
          letterSpacing: 2,
        }}
      >
        QUESTION {index + 1}
      </Text>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.display,
          fontWeight: '600',
          fontSize: 16,
          marginTop: 6,
          lineHeight: 22,
        }}
      >
        {question.prompt}
      </Text>
      <View style={{ gap: 8, marginTop: 12 }}>
        {question.choices.map((choice) => {
          const selected = selectedChoiceId === choice.id;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={choice.text}
              onPress={() => onSelect(choice.id)}
              style={({ pressed }) => [
                styles.choiceRow,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.surface : 'transparent',
                  borderRadius: theme.radii.md,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.radioPip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                {selected ? (
                  <View
                    style={[styles.radioDot, { backgroundColor: theme.colors.primary }]}
                  />
                ) : null}
              </View>
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.body,
                  fontSize: 15,
                  lineHeight: 21,
                }}
              >
                {choice.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  radioPip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
