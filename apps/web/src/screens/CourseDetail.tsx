/**
 * CourseDetail — one course's modules + lessons, with an inline video player.
 *
 * Loads via `getCourseTree(courseId)`, which is RLS-scoped (NO tenant_id sent), so
 * a courseId can only ever resolve within the caller's tenant — an unknown or
 * foreign id (e.g. from a pasted/deep-linked URL) renders the not-found state.
 * Selecting a video lesson mounts <StreamWebPlayer/>, which fetches a
 * tenant-checked signed token from the `stream-signed-url` edge function.
 * Non-video lessons show a simple content placeholder (this preview surface
 * plays video; richer content lives in the mobile app).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { LessonKind, LessonRecord } from '@soteria-forge/shared'
import { getCourseTree, type CourseTree } from '../api'
import { StreamWebPlayer } from '../components/StreamWebPlayer'

export interface CourseDetailProps {
  courseId: string
  onBack: () => void
}

const SKELETON_ROW_COUNT = 5

/**
 * KindIcon — one distinct stroke glyph per LessonKind, drawn inline with
 * `currentColor` so it inherits the row's token-driven colour (no brand hex
 * ever appears here). Keyed as Record<LessonKind, …> so TypeScript enforces
 * that all 7 kinds stay covered.
 */
const KIND_GLYPHS: Record<LessonKind, ReactElement> = {
  // Play triangle
  video: <path d="M9 6.5 18 12l-9 5.5Z" />,
  // Question mark
  quiz: (
    <>
      <path d="M9.2 9.2a2.8 2.8 0 1 1 4 2.7c-.9.4-1.2 1-1.2 1.9" />
      <path d="M12 17.2h.01" />
    </>
  ),
  // Gamepad: body + d-pad + buttons
  game: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="4.5" />
      <path d="M8 11v3M6.5 12.5h3" />
      <path d="M15.5 13.5h.01M17.5 11.5h.01" />
    </>
  ),
  // Package/box
  scorm: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  // File with folded corner + text lines
  document: (
    <>
      <path d="M13.5 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7.5Z" />
      <path d="M13.5 3v4.5H18M9 12h6M9 15.5h6" />
    </>
  ),
  // Speech/thought bubble
  reflection: (
    <path d="M21 11.5a7 7 0 0 1-7 7H7.5L3 21.5v-10a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7Z" />
  ),
  // Clipboard with a check
  'practical-signoff': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6M9 13.5l2 2 4-4.5" />
    </>
  ),
}

export function KindIcon({ kind }: { kind: LessonKind }) {
  return (
    <svg
      className="kind-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {KIND_GLYPHS[kind]}
    </svg>
  )
}

export function CourseDetail({ courseId, onBack }: CourseDetailProps) {
  const [tree, setTree] = useState<CourseTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [backendPending, setBackendPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Monotonic request sequence: a response superseded by a retry, a courseId
  // change, or unmount is dropped instead of clobbering newer state.
  const requestSeq = useRef(0)

  const load = useCallback(() => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    setSelectedLessonId(null)
    getCourseTree(courseId)
      .then((res) => {
        if (seq !== requestSeq.current) return
        setTree(res.data)
        setBackendPending(res.backendPending)
        // Preselect the first video lesson so the player area isn't empty.
        const firstVideo = res.data?.lessons.find((l) => l.kind === 'video')
        setSelectedLessonId(firstVideo?.id ?? res.data?.lessons[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Failed to load course')
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [courseId])

  useEffect(() => {
    load()
    return () => {
      // Invalidate any in-flight request on unmount / courseId change.
      requestSeq.current++
    }
  }, [load])

  // The view just switched (or the tree finished loading): land focus on the
  // course title so keyboard/screen-reader users start at the new heading.
  useEffect(() => {
    if (!loading && tree) headingRef.current?.focus()
  }, [loading, tree])

  const selectedLesson: LessonRecord | null = useMemo(() => {
    if (!tree || !selectedLessonId) return null
    return tree.lessons.find((l) => l.id === selectedLessonId) ?? null
  }, [tree, selectedLessonId])

  return (
    <section className="course-detail">
      <button type="button" className="btn btn--ghost course-detail__back" onClick={onBack}>
        ← All courses
      </button>

      {loading ? (
        <div aria-busy="true">
          <div aria-hidden="true">
            <header className="course-detail__header skeleton-stack">
              <span className="skeleton skeleton--h1" />
              <span className="skeleton skeleton--text skeleton--short" />
            </header>
            <div className="course-detail__body">
              <div className="course-detail__player">
                <span className="skeleton skeleton--frame" />
              </div>
              <div className="course-detail__outline">
                <div className="module-block skeleton-stack">
                  <span className="skeleton skeleton--pill" />
                  {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                    <span key={i} className="skeleton skeleton--row" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="state state--error" role="alert">
          <p className="state__message">{error}</p>
          <button type="button" className="btn btn--ghost" onClick={load}>
            Retry
          </button>
        </div>
      ) : backendPending ? (
        <p className="state state--empty">
          The backend isn’t configured yet, so this course can’t be loaded.
        </p>
      ) : !tree ? (
        <p className="state state--empty">This course isn’t available.</p>
      ) : (
        <>
          <header className="course-detail__header">
            <h1 className="course-detail__title" tabIndex={-1} ref={headingRef}>
              {tree.course.title}
            </h1>
            {tree.course.description ? (
              <p className="course-detail__desc">{tree.course.description}</p>
            ) : null}
          </header>

          <div className="course-detail__body">
            <div className="course-detail__player">
              {selectedLesson && selectedLesson.kind === 'video' ? (
                <div className="video-frame">
                  <StreamWebPlayer lessonId={selectedLesson.id} />
                </div>
              ) : selectedLesson ? (
                <div className="video-frame video-frame--placeholder">
                  <div className="content-placeholder">
                    <p className="content-placeholder__kind">{selectedLesson.kind}</p>
                    <p>
                      This lesson isn’t a video. Open it in the Soteria Forge app to complete it.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="video-frame video-frame--placeholder">
                  <div className="content-placeholder">
                    <p>Select a lesson to begin.</p>
                  </div>
                </div>
              )}
              {selectedLesson ? (
                <div className="lesson-meta">
                  <h2 className="lesson-meta__title">{selectedLesson.title}</h2>
                  {selectedLesson.description ? (
                    <p className="lesson-meta__desc">{selectedLesson.description}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <nav className="course-detail__outline" aria-label="Lessons">
              {tree.modules.length === 0 ? (
                <p className="state state--empty">This course has no lessons yet.</p>
              ) : (
                tree.modules.map((module) => (
                  <div key={module.id} className="module-block">
                    <h3 className="module-block__title">{module.title}</h3>
                    <ul className="lesson-list">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <button
                            type="button"
                            className="lesson-item"
                            data-active={lesson.id === selectedLessonId}
                            aria-current={lesson.id === selectedLessonId ? 'true' : undefined}
                            onClick={() => setSelectedLessonId(lesson.id)}
                          >
                            <span className="lesson-item__kind" data-kind={lesson.kind}>
                              <KindIcon kind={lesson.kind} />
                            </span>
                            <span className="lesson-item__title">{lesson.title}</span>
                            <span className="lesson-item__meta">
                              {lesson.durationMinutes > 0 ? (
                                <span className="lesson-item__duration">
                                  ~{lesson.durationMinutes} min
                                </span>
                              ) : null}
                              {lesson.required ? (
                                <span
                                  className="lesson-item__required"
                                  title="Required to complete this course"
                                >
                                  Required
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </nav>
          </div>
        </>
      )}
    </section>
  )
}
