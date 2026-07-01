/**
 * CourseDetail — one course's modules + lessons, with an inline video player.
 *
 * Loads via `getCourseTree(courseId)`, which is RLS-scoped (NO tenant_id sent), so
 * a courseId can only ever resolve within the caller's tenant. Selecting a video
 * lesson mounts <StreamWebPlayer/>, which fetches a tenant-checked signed token
 * from the `stream-signed-url` edge function. Non-video lessons show a simple
 * content placeholder (this preview surface plays video; richer content lives in
 * the mobile app).
 */
import { useEffect, useMemo, useState } from 'react'
import type { LessonRecord } from '@soteria-forge/shared'
import { getCourseTree, type CourseTree } from '../api'
import { StreamWebPlayer } from '../components/StreamWebPlayer'

export interface CourseDetailProps {
  courseId: string
  onBack: () => void
}

export function CourseDetail({ courseId, onBack }: CourseDetailProps) {
  const [tree, setTree] = useState<CourseTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [backendPending, setBackendPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setSelectedLessonId(null)
    getCourseTree(courseId)
      .then((res) => {
        if (!active) return
        setTree(res.data)
        setBackendPending(res.backendPending)
        // Preselect the first video lesson so the player area isn't empty.
        const firstVideo = res.data?.lessons.find((l) => l.kind === 'video')
        setSelectedLessonId(firstVideo?.id ?? res.data?.lessons[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load course')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [courseId])

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
        <p className="state state--loading">Loading course…</p>
      ) : error ? (
        <p className="state state--error" role="alert">
          {error}
        </p>
      ) : backendPending ? (
        <p className="state state--empty">
          The backend isn’t configured yet, so this course can’t be loaded.
        </p>
      ) : !tree ? (
        <p className="state state--empty">This course isn’t available.</p>
      ) : (
        <>
          <header className="course-detail__header">
            <h1 className="course-detail__title">{tree.course.title}</h1>
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
                            onClick={() => setSelectedLessonId(lesson.id)}
                          >
                            <span className="lesson-item__kind" data-kind={lesson.kind}>
                              {lesson.kind === 'video' ? '▶' : '•'}
                            </span>
                            <span className="lesson-item__title">{lesson.title}</span>
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
