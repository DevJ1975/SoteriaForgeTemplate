/**
 * Tests for the course-list grouping/ordering rules (courseSections): assigned
 * courses sort overdue → soonest due → title (no due date last); unassigned
 * published courses form the catalog; empty sections are omitted; and the
 * complete/overdue predicates the Home KPIs share behave at their boundaries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CourseRecord, EnrollmentRecord } from '@soteria-forge/shared';

import {
  buildCourseSections,
  isEnrollmentComplete,
  isEnrollmentOverdue,
} from '../courseSections';

// A fixed "now" so due-date math is deterministic: 2026-07-01T00:00:00Z.
const NOW = Date.parse('2026-07-01T00:00:00.000Z');
const PAST = '2026-06-01T00:00:00.000Z';
const SOON = '2026-07-05T00:00:00.000Z';
const LATER = '2026-08-01T00:00:00.000Z';

function course(id: string, title: string): CourseRecord {
  return {
    tenantId: 'tenant-alpha',
    id,
    title,
    description: `${title} description`,
    status: 'published',
    tags: [],
    fieldReadinessScore: 80,
    createdAt: PAST,
    updatedAt: PAST,
  };
}

function enrollment(
  courseId: string,
  overrides: Partial<EnrollmentRecord> = {},
): EnrollmentRecord {
  return {
    tenantId: 'tenant-alpha',
    id: `enr-${courseId}`,
    userId: 'user-a',
    courseId,
    status: 'assigned',
    progress: 0,
    assignedAt: PAST,
    createdAt: PAST,
    updatedAt: PAST,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Predicates (shared with the Home KPIs)
// ---------------------------------------------------------------------------

test('isEnrollmentComplete: server status or 100% progress', () => {
  assert.equal(isEnrollmentComplete(enrollment('c', { status: 'completed' })), true);
  assert.equal(isEnrollmentComplete(enrollment('c', { progress: 100 })), true);
  assert.equal(isEnrollmentComplete(enrollment('c', { progress: 99 })), false);
});

test('isEnrollmentOverdue: past due OR server-flagged, but NEVER when complete', () => {
  assert.equal(isEnrollmentOverdue(enrollment('c', { dueAt: PAST }), NOW), true);
  assert.equal(isEnrollmentOverdue(enrollment('c', { status: 'overdue' }), NOW), true, 'server flag counts without a due date');
  assert.equal(isEnrollmentOverdue(enrollment('c', { dueAt: SOON }), NOW), false);
  assert.equal(isEnrollmentOverdue(enrollment('c'), NOW), false, 'no due date, no flag → not overdue');
  // A finished course can never be overdue, whatever its due date says.
  assert.equal(isEnrollmentOverdue(enrollment('c', { dueAt: PAST, progress: 100 }), NOW), false);
  assert.equal(isEnrollmentOverdue(enrollment('c', { dueAt: PAST, status: 'completed' }), NOW), false);
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

test('enrolled courses land in "Assigned to me"; the rest form the catalog', () => {
  const courses = [course('c1', 'Alpha'), course('c2', 'Bravo'), course('c3', 'Charlie')];
  const sections = buildCourseSections(courses, [enrollment('c2')], NOW);

  assert.deepEqual(sections.map((s) => s.title), ['Assigned to me', 'Course catalog']);
  assert.deepEqual(sections[0]?.data.map((i) => i.course.id), ['c2']);
  assert.equal(sections[0]?.data[0]?.enrollment?.courseId, 'c2');
  assert.deepEqual(sections[1]?.data.map((i) => i.course.id), ['c1', 'c3']);
  assert.equal(sections[1]?.data.every((i) => i.enrollment === null), true);
});

test('empty sections are omitted entirely', () => {
  assert.deepEqual(buildCourseSections([], [], NOW), []);

  const onlyCatalog = buildCourseSections([course('c1', 'Alpha')], [], NOW);
  assert.deepEqual(onlyCatalog.map((s) => s.title), ['Course catalog']);

  const onlyAssigned = buildCourseSections([course('c1', 'Alpha')], [enrollment('c1')], NOW);
  assert.deepEqual(onlyAssigned.map((s) => s.title), ['Assigned to me']);
});

test('an enrollment for a course NOT in the published list is simply not shown', () => {
  // e.g. the course was unpublished after assignment — nothing to render.
  const sections = buildCourseSections([course('c1', 'Alpha')], [enrollment('ghost')], NOW);
  assert.deepEqual(sections.map((s) => s.title), ['Course catalog']);
});

// ---------------------------------------------------------------------------
// Ordering: overdue → soonest due → (no due date last) → title
// ---------------------------------------------------------------------------

test('assigned ordering: overdue first, then soonest due, no due date last, then title', () => {
  const courses = [
    course('no-due', 'Zulu'),
    course('due-later', 'Yankee'),
    course('due-soon', 'X-ray'),
    course('overdue', 'Whiskey'),
  ];
  const enrollments = [
    enrollment('no-due'),
    enrollment('due-later', { dueAt: LATER }),
    enrollment('due-soon', { dueAt: SOON }),
    enrollment('overdue', { dueAt: PAST }),
  ];
  const sections = buildCourseSections(courses, enrollments, NOW);
  assert.deepEqual(
    sections[0]?.data.map((i) => i.course.id),
    ['overdue', 'due-soon', 'due-later', 'no-due'],
  );
});

test('ties on due date (and on "no due date") break by course title', () => {
  const courses = [course('b', 'Bravo'), course('a', 'Alpha'), course('c', 'Charlie')];
  const sections = buildCourseSections(
    courses,
    [enrollment('b', { dueAt: SOON }), enrollment('a', { dueAt: SOON }), enrollment('c', { dueAt: SOON })],
    NOW,
  );
  assert.deepEqual(sections[0]?.data.map((i) => i.course.title), ['Alpha', 'Bravo', 'Charlie']);

  const noDue = buildCourseSections(courses, [enrollment('b'), enrollment('c'), enrollment('a')], NOW);
  assert.deepEqual(noDue[0]?.data.map((i) => i.course.title), ['Alpha', 'Bravo', 'Charlie']);
});

test('a COMPLETED past-due enrollment is not overdue and must not jump the queue', () => {
  const courses = [course('done', 'Alpha'), course('late', 'Bravo')];
  const sections = buildCourseSections(
    courses,
    [
      enrollment('done', { dueAt: PAST, status: 'completed', progress: 100 }),
      enrollment('late', { dueAt: SOON }),
    ],
    NOW,
  );
  // Neither is overdue; 'done' still sorts first because its due date is
  // earlier — completion changes the badge, not the calendar.
  assert.deepEqual(sections[0]?.data.map((i) => i.course.id), ['done', 'late']);
});

test('the server "overdue" status sorts first even without a due date', () => {
  const courses = [course('flagged', 'Zulu'), course('soon', 'Alpha')];
  const sections = buildCourseSections(
    courses,
    [enrollment('flagged', { status: 'overdue' }), enrollment('soon', { dueAt: SOON })],
    NOW,
  );
  assert.deepEqual(sections[0]?.data.map((i) => i.course.id), ['flagged', 'soon']);
});
