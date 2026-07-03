/**
 * courseSections — pure grouping/sorting/status logic behind the course list
 * and the Home KPIs. No React, no React Native: extracted from
 * CourseListScreen so the ordering rules are unit-testable under plain Node
 * (see __tests__/courseSections.test.ts) and shared with HomeScreen's
 * assigned / complete / overdue counters.
 */
import type { CourseRecord, EnrollmentRecord } from '@soteria-forge/shared';

/** One list row: a published course, plus the caller's enrollment if assigned. */
export interface CourseListItem {
  course: CourseRecord;
  enrollment: EnrollmentRecord | null;
}

export interface CourseSection {
  title: string;
  data: CourseListItem[];
}

/** Is this enrollment finished (server status or 100% progress)? */
export function isEnrollmentComplete(e: EnrollmentRecord): boolean {
  return e.status === 'completed' || e.progress >= 100;
}

/** Is this enrollment overdue (server status, or past its due date, unfinished)? */
export function isEnrollmentOverdue(e: EnrollmentRecord, now: number): boolean {
  if (isEnrollmentComplete(e)) return false;
  if (e.status === 'overdue') return true;
  return e.dueAt !== undefined && Date.parse(e.dueAt) < now;
}

/**
 * Group the published catalog against the caller's enrollments. Assigned rows
 * sort overdue first, then by soonest due date (no due date last), then title;
 * unassigned published courses form the browsable catalog section.
 */
export function buildCourseSections(
  courses: CourseRecord[],
  enrollments: EnrollmentRecord[],
  now: number = Date.now(),
): CourseSection[] {
  const enrollmentByCourse = new Map<string, EnrollmentRecord>();
  for (const e of enrollments) enrollmentByCourse.set(e.courseId, e);

  const assigned: CourseListItem[] = [];
  const catalog: CourseListItem[] = [];
  for (const course of courses) {
    const enrollment = enrollmentByCourse.get(course.id) ?? null;
    if (enrollment) assigned.push({ course, enrollment });
    else catalog.push({ course, enrollment: null });
  }

  assigned.sort((a, b) => {
    const ea = a.enrollment as EnrollmentRecord;
    const eb = b.enrollment as EnrollmentRecord;
    const overdueDelta = Number(isEnrollmentOverdue(eb, now)) - Number(isEnrollmentOverdue(ea, now));
    if (overdueDelta !== 0) return overdueDelta;
    const dueA = ea.dueAt !== undefined ? Date.parse(ea.dueAt) : Number.POSITIVE_INFINITY;
    const dueB = eb.dueAt !== undefined ? Date.parse(eb.dueAt) : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return a.course.title.localeCompare(b.course.title);
  });

  const sections: CourseSection[] = [];
  if (assigned.length > 0) sections.push({ title: 'Assigned to me', data: assigned });
  if (catalog.length > 0) sections.push({ title: 'Course catalog', data: catalog });
  return sections;
}
