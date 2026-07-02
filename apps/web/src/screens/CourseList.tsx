/**
 * CourseList — the learner's course catalogue for their tenant.
 *
 * Reads via `listCourses()`, which is RLS-scoped: it returns ONLY the caller's
 * own tenant's courses and sends NO tenant_id. Clicking a course opens its detail.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CourseRecord } from '@soteria-forge/shared'
import { listCourses } from '../api'

export interface CourseListProps {
  onOpenCourse: (courseId: string) => void
  /** Move focus to the list heading once loaded (set when the view was switched to). */
  focusHeadingOnLoad?: boolean
}

const SKELETON_CARD_COUNT = 6

export function CourseList({ onOpenCourse, focusHeadingOnLoad = false }: CourseListProps) {
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [backendPending, setBackendPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Monotonic request sequence: a response superseded by a retry (or unmount)
  // is dropped instead of clobbering newer state.
  const requestSeq = useRef(0)

  const load = useCallback(() => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    listCourses()
      .then((res) => {
        if (seq !== requestSeq.current) return
        setCourses(res.data)
        setBackendPending(res.backendPending)
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Failed to load courses')
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
    return () => {
      // Invalidate any in-flight request on unmount.
      requestSeq.current++
    }
  }, [load])

  // When the shell switched views to the list, land focus on its heading.
  useEffect(() => {
    if (!loading && focusHeadingOnLoad) headingRef.current?.focus()
  }, [loading, focusHeadingOnLoad])

  if (loading) {
    return (
      <section className="course-list" aria-label="Courses" aria-busy="true">
        <h1 className="section-title" tabIndex={-1} ref={headingRef}>
          Your courses
        </h1>
        <ul className="course-grid">
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
            <li key={i} aria-hidden="true">
              <div className="card course-card course-card--skeleton">
                <span className="skeleton skeleton--pill" />
                <span className="skeleton skeleton--title" />
                <span className="skeleton skeleton--text" />
                <span className="skeleton skeleton--text skeleton--short" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (error) {
    return (
      <div className="state state--error" role="alert">
        <p className="state__message">{error}</p>
        <button type="button" className="btn btn--ghost" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  if (backendPending) {
    return (
      <p className="state state--empty">
        The backend isn’t configured yet, so there are no courses to show.
      </p>
    )
  }

  if (courses.length === 0) {
    return <p className="state state--empty">No courses are available yet.</p>
  }

  return (
    <section className="course-list" aria-label="Courses">
      <h1 className="section-title" tabIndex={-1} ref={headingRef}>
        Your courses
      </h1>
      <ul className="course-grid">
        {courses.map((course) => (
          <li key={course.id}>
            <button
              type="button"
              className="card course-card"
              onClick={() => onOpenCourse(course.id)}
            >
              <span className="course-card__status" data-status={course.status}>
                {course.status}
              </span>
              <h2 className="course-card__title">{course.title}</h2>
              {course.description ? (
                <p className="course-card__desc">{course.description}</p>
              ) : null}
              {course.category || course.durationMinutes ? (
                <span className="course-card__meta">
                  {course.category ? <span>{course.category}</span> : null}
                  {course.durationMinutes ? (
                    <span className="course-card__duration">~{course.durationMinutes} min</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
