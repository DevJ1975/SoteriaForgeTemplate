/**
 * LessonPlayer — plays one lesson on the web surface and CLOSES THE LEARNING
 * LOOP by recording an append-only xAPI completion, mirroring mobile's
 * LessonPlayerScreen/QuizPlayer.
 *
 * RENDERING by kind:
 *   - video → the official Cloudflare Stream player (`StreamWebPlayer`), plus a
 *     Mark-complete control (a `completed` statement).
 *   - quiz WITH authored questions → the full `QuizView` flow (local scoring →
 *     `passed`/`failed` with result.score).
 *   - document / reflection / any lesson with authored `content.body` → the body
 *     text + a Mark-complete control.
 *   - anything else → the description + a Mark-complete control.
 *
 * RECORDING: completion goes through `useOutbox().recordCompletion`, which injects
 * tenantId/userId/actor from the VERIFIED session — never from props/route. The
 * statement is built by the shared `createCompletionStatement` (client UUID =
 * idempotency key), appended to the durable IndexedDB outbox, and drained to
 * Supabase by the sync engine; it records IDENTICALLY to the mobile app. Works
 * offline: the enqueue is a local write and the completion reflects immediately.
 *
 * Every surface state is covered: content, offline (reflected in copy + the
 * global indicator), error (submit retry), and the already-complete state. No
 * hardcoded brand hex (only --sf-* token-driven classes).
 */
import { useState } from 'react'
import { xapiVerbs, type XapiObject } from '@soteria-forge/shared'
import type { LessonWithContent } from '../api'
import { useOutbox } from '../offline/OutboxProvider'
import { StreamWebPlayer } from './StreamWebPlayer'
import { QuizView } from './QuizView'

export interface LessonPlayerProps {
  lesson: LessonWithContent
  /** True when the outbox already has a completion for this lesson (this user). */
  completed: boolean
  /** Called after a completion is recorded so the outline flips instantly. */
  onCompleted: () => void
}

/** Short per-kind prompt for the mark-complete flow (mirrors mobile's bodyCopy). */
function markCompletePrompt(kind: LessonWithContent['kind']): string {
  switch (kind) {
    case 'video':
      return 'Watch the full clip, then mark the lesson complete to record your progress.'
    case 'reflection':
      return 'Think through the prompt and how it applies on your site, then mark complete.'
    case 'document':
      return 'Read the material end to end, then mark the lesson complete.'
    case 'practical-signoff':
      return 'Complete the hands-on task with your supervisor, then mark it complete.'
    default:
      return 'Work through the lesson, then mark it complete.'
  }
}

export function LessonPlayer({ lesson, completed, onCompleted }: LessonPlayerProps) {
  const { recordCompletion, isOnline } = useOutbox()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isVideo = lesson.kind === 'video'
  // A quiz WITH renderable questions gets the real quiz flow; an empty-content
  // quiz falls back to mark-complete so legacy/unauthored lessons stay completable.
  const hasQuiz = lesson.kind === 'quiz' && lesson.content.questions.length > 0

  const onMarkComplete = async () => {
    if (completed || submitting) return
    setSubmitting(true)
    setError(null)
    const object: XapiObject = {
      id: `lesson:${lesson.id}`,
      definition: {
        name: { 'en-US': lesson.title },
        type: 'http://adlnet.gov/expapi/activities/lesson',
      },
    }
    try {
      await recordCompletion({
        verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
        object,
        result: { completion: true },
        // EXACTLY { course_id, lesson_id } — the server progress trigger reads this.
        context: { course_id: lesson.courseId, lesson_id: lesson.id },
      })
      onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record completion. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Long-form body split into paragraphs for legible reading.
  const bodyParagraphs = lesson.content.body
    ? lesson.content.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : []

  return (
    <div className="lesson-player">
      {isVideo ? (
        <div className="video-frame">
          <StreamWebPlayer lessonId={lesson.id} />
        </div>
      ) : null}

      <div className="lesson-meta">
        <div className="lesson-meta__head">
          <h2 className="lesson-meta__title">{lesson.title}</h2>
          {completed ? (
            <span className="lesson-badge" data-tone="complete">
              Completed
            </span>
          ) : null}
        </div>
        {lesson.description ? (
          <p className="lesson-meta__desc">{lesson.description}</p>
        ) : null}
      </div>

      {bodyParagraphs.length > 0 ? (
        <div className="lesson-body">
          {bodyParagraphs.map((p, i) => (
            <p key={i} className="lesson-body__p">
              {p}
            </p>
          ))}
        </div>
      ) : null}

      {hasQuiz ? (
        <QuizView lesson={lesson} alreadyCompleted={completed} onPassed={onCompleted} />
      ) : (
        <div className="lesson-complete">
          {!completed ? (
            <p className="lesson-complete__prompt">{markCompletePrompt(lesson.kind)}</p>
          ) : null}
          {error ? (
            <p className="lesson-complete__error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn--primary"
            disabled={completed || submitting}
            onClick={() => void onMarkComplete()}
          >
            {completed
              ? 'Completed'
              : submitting
                ? 'Recording…'
                : isOnline
                  ? 'Mark complete'
                  : 'Mark complete (syncs later)'}
          </button>
        </div>
      )}
    </div>
  )
}
