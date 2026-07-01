/**
 * Model barrel + the ordered list WatermelonDB's Database needs at construction.
 */
export { CourseModel } from './CourseModel';
export { ModuleModel } from './ModuleModel';
export { LessonModel } from './LessonModel';
export { QuizStateModel } from './QuizStateModel';
export type { QuizAnswers, QuizStatus } from './QuizStateModel';
export { VideoModel } from './VideoModel';
export type { VideoDownloadStatus } from './VideoModel';
export { CompletionStatementModel } from './CompletionStatementModel';

import { CourseModel } from './CourseModel';
import { ModuleModel } from './ModuleModel';
import { LessonModel } from './LessonModel';
import { QuizStateModel } from './QuizStateModel';
import { VideoModel } from './VideoModel';
import { CompletionStatementModel } from './CompletionStatementModel';

/** All model classes, passed to `new Database({ modelClasses })`. */
export const modelClasses = [
  CourseModel,
  ModuleModel,
  LessonModel,
  QuizStateModel,
  VideoModel,
  CompletionStatementModel,
];
