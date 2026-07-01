/**
 * CourseList — the learner's course catalogue for their tenant.
 *
 * Reads via `listCourses()`, which is RLS-scoped: it returns ONLY the caller's
 * own tenant's courses and sends NO tenant_id. Clicking a course opens its detail.
 */
import { useEffect, useState } from 'react'
import type { CourseRecord } from '@soteria-forge/shared'
import { listCourses } from '../api'

export interface CourseListProps {
  onOpenCourse: (courseId: string) => void
}

export function CourseList({ onOpenCourse }: CourseListProps) {
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [backendPending, setBackendPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    listCourses()
      .then((res) => {
        if (!active) return
        setCourses(res.data)
        setBackendPending(res.backendPending)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load courses')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <p className="state state--loading">Loading courses…</p>
  }

  if (error) {
    return (
      <p className="state state--error" role="alert">
        {error}
      </p>
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
      <h1 className="section-title">Your courses</h1>
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
              {course.category ? (
                <span className="course-card__meta">{course.category}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
