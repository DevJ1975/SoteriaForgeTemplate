/**
 * QuizView — the web quiz flow for a `quiz` lesson with authored questions.
 *
 * Web mirror of `apps/mobile/src/components/QuizPlayer.tsx`:
 *   render parsed questions/choices → capture single-choice answers → score
 *   locally with the SHARED `scoreQuiz` → enforce the resolved passing score →
 *   record an append-only xAPI statement with verb `passed` or `failed`,
 *   `result.score` + `result.success`, through the SAME outbox every completion
 *   uses. `passed` drives server enrollment progress (migration 12 counts
 *   completed OR passed); `failed` is recorded but never advances progress.
 *
 * IDEMPOTENCY (one attempt = one id): the client UUID is minted ONCE per attempt
 * and pinned in a ref BEFORE the record is enqueued, so a failed-enqueue retry
 * reuses the SAME id (the outbox and the server both dedupe on the UUID) and can
 * never double-record. A RETAKE after failure is a NEW attempt → a fresh UUID.
 * (Unlike mobile there is no cross-reload resume store here; a kiosk reload
 * mid-quiz restarts the attempt — an accepted trade-off documented in the ADR.)
 *
 * INVARIANTS: identity (tenant/user/actor) is injected by the OutboxProvider from
 * the verified session — never from props; context is EXACTLY { course_id,
 * lesson_id }. No hardcoded brand hex (only --sf-* token-driven classes).
 */
import { useMemo, useRef, useState } from 'react'
import {
  generateStatementId,
  resolvePassingScore,
  scoreQuiz,
  xapiVerbs,
  type XapiObject,
} from '@soteria-forge/shared'
import type { LessonWithContent } from '../api'
import { useOutbox } from '../offline/OutboxProvider'

export interface QuizViewProps {
  lesson: LessonWithContent
  /** True when this lesson is already known complete (from an earlier attempt). */
  alreadyCompleted: boolean
  /** Called after a PASSING attempt is recorded so the outline reflects it. */
  onPassed: () => void
}

type Phase = 'answering' | 'submitted'

export function QuizView({ lesson, alreadyCompleted, onPassed }: QuizViewProps) {
  const { recordCompletion, isOnline } = useOutbox()
  const questions = lesson.content.questions
  const passingScore = resolvePassingScore(lesson.passingScore, lesson.content.passingScore)

  const [phase, setPhase] = useState<Phase>('answering')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [score, setScore] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  // The pinned attempt id — reused on a record retry (idempotent), cleared on retake.
  const pinnedIdRef = useRef<string | null>(null)

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] !== undefined).length,
    [questions, answers],
  )
  const allAnswered = answeredCount === questions.length

  const object: XapiObject = useMemo(
    () => ({
      id: `lesson:${lesson.id}`,
      definition: {
        name: { 'en-US': lesson.title },
        type: 'http://adlnet.gov/expapi/activities/assessment',
      },
    }),
    [lesson.id, lesson.title],
  )

  const enqueueAttempt = async (id: string, pct: number, passed: boolean) => {
    await recordCompletion({
      id,
      verb: passed
        ? { id: xapiVerbs.passed, display: { 'en-US': 'passed' } }
        : { id: xapiVerbs.failed, display: { 'en-US': 'failed' } },
      object,
      result: {
        score: { raw: pct, min: 0, max: 100, scaled: pct / 100 },
        success: passed,
        // The attempt was carried to the end either way; `success` says whether
        // the threshold was met.
        completion: true,
      },
      // EXACTLY { course_id, lesson_id } — the server progress trigger reads this.
      context: { course_id: lesson.courseId, lesson_id: lesson.id },
    })
  }

  const onSelect = (questionId: string, choiceId: string) => {
    if (phase !== 'answering' || submitting) return
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }))
  }

  const onSubmit = async () => {
    if (phase !== 'answering' || submitting || !allAnswered) return
    setSubmitting(true)
    setRecordError(null)

    const { score: pct } = scoreQuiz(questions, answers)
    const passed = pct >= passingScore
    // Mint + pin the attempt id BEFORE enqueue so a retry reuses it (idempotent).
    const id = generateStatementId()
    pinnedIdRef.current = id

    setScore(pct)
    setPhase('submitted')
    try {
      await enqueueAttempt(id, pct, passed)
      if (passed) onPassed()
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Could not record your attempt.')
    } finally {
      setSubmitting(false)
    }
  }

  const onRetryRecord = async () => {
    const id = pinnedIdRef.current
    if (id === null || score === null) return
    setRecordError(null)
    const passed = score >= passingScore
    try {
      await enqueueAttempt(id, score, passed) // SAME pinned id — idempotent
      if (passed) onPassed()
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Could not record your attempt.')
    }
  }

  const onRetake = () => {
    // A retake is a NEW attempt: clear answers AND the pinned id (fresh UUID next).
    pinnedIdRef.current = null
    setAnswers({})
    setScore(null)
    setRecordError(null)
    setPhase('answering')
  }

  // ── Result state ─────────────────────────────────────────────────────────
  if (phase === 'submitted' && score !== null) {
    const passed = score >= passingScore
    const { correct, total } = scoreQuiz(questions, answers)
    return (
      <div className="quiz quiz--result" role="status">
        <div className="quiz-result__head">
          <span
            className="quiz-result__badge"
            data-tone={passed ? 'pass' : 'fail'}
          >
            {passed ? 'Passed' : 'Not passed'}
          </span>
          <span className="quiz-result__score" data-tone={passed ? 'pass' : 'fail'}>
            {score}%
          </span>
        </div>
        <p className="quiz-result__detail">
          {correct} of {total} correct · {passingScore}% needed to pass.{' '}
          {passed
            ? isOnline
              ? 'Your result is recorded and syncs automatically.'
              : 'Your result is recorded and will sync when you’re back online.'
            : 'Your attempt is recorded — review the material and try again.'}
        </p>

        {recordError ? (
          <div className="quiz-result__error" role="alert">
            <p>{recordError}</p>
            <button type="button" className="btn btn--ghost" onClick={() => void onRetryRecord()}>
              Retry saving result
            </button>
          </div>
        ) : null}

        {!passed ? (
          <button type="button" className="btn btn--primary" onClick={onRetake}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  // ── Answering state ──────────────────────────────────────────────────────
  return (
    <div className="quiz">
      {alreadyCompleted ? (
        <p className="quiz__note">
          You’ve already completed this lesson — a new attempt adds to your record and never
          reduces your progress.
        </p>
      ) : null}

      {questions.map((q, index) => (
        <fieldset key={q.id} className="quiz-question">
          <legend className="quiz-question__legend">
            <span className="quiz-question__num">Question {index + 1}</span>
            <span className="quiz-question__prompt">{q.prompt}</span>
          </legend>
          <div className="quiz-question__choices">
            {q.choices.map((choice) => {
              const selected = answers[q.id] === choice.id
              return (
                <label
                  key={choice.id}
                  className="quiz-choice"
                  data-selected={selected}
                >
                  <input
                    type="radio"
                    className="quiz-choice__input"
                    name={`q-${q.id}`}
                    value={choice.id}
                    checked={selected}
                    onChange={() => onSelect(q.id, choice.id)}
                  />
                  <span className="quiz-choice__pip" aria-hidden="true" />
                  <span className="quiz-choice__text">{choice.text}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}

      <p className="quiz__progress">
        {answeredCount} of {questions.length} answered · pass at {passingScore}%
      </p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={!allAnswered || submitting}
        onClick={() => void onSubmit()}
      >
        {submitting ? 'Submitting…' : 'Submit answers'}
      </button>
    </div>
  )
}
