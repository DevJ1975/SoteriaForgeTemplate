/**
 * API barrel — the tenant-scoped data access surface.
 */
export { getDataClient, BackendNotConfiguredError } from './dataClient';
export type { DataClient } from './dataClient';
export { useCourses } from './useCourses';
export type { UseCoursesResult } from './useCourses';
export { useEnrollments } from './useEnrollments';
export type { UseEnrollmentsResult } from './useEnrollments';
export { useCourseTree, assembleCourseTree, useLesson } from './courseTree';
export type {
  UseCourseTreeResult,
  CourseTree,
  ModuleNode,
  LessonNode,
  UseLessonResult,
  LessonDetail,
} from './courseTree';
export {
  parseLessonContent,
  scoreQuiz,
  resolvePassingScore,
  DEFAULT_PASSING_SCORE,
} from './lessonContent';
export type {
  LessonContent,
  QuizQuestion,
  QuizChoice,
  QuizScore,
} from './lessonContent';
export { useCertificates, useCertificate } from './certificates';
export type {
  CertificateRecord,
  UseCertificatesResult,
  UseCertificateResult,
} from './certificates';
export { useLessonVideo } from './videoPlayback';
export type { LessonVideoSource, VideoSourceStatus } from './videoPlayback';
