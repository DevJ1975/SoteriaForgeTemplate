/**
 * Lesson content — the typed view over the `lessons.content` jsonb column.
 *
 * The contract (types + defensive parser + on-device quiz scoring) now lives in
 * `@soteria-forge/shared` (`src/lessonContent.ts`) so that the console's
 * authoring flow and the mobile player share ONE definition and cannot drift.
 * This module is a thin, node-safe RE-EXPORT that preserves the app's original
 * import path (`../api/lessonContent`) — nothing renders or scores here.
 *
 * See the shared module for the documented jsonb shape and the accepted MVP
 * trade-off that `correctChoiceId` ships inside the RLS-readable content so
 * quizzes can be scored on-device (fully offline); server-side scoring is the
 * future hardening.
 */

export {
  parseLessonContent,
  scoreQuiz,
  resolvePassingScore,
  DEFAULT_PASSING_SCORE,
} from '@soteria-forge/shared';

export type {
  QuizChoice,
  QuizQuestion,
  LessonContent,
  QuizScore,
} from '@soteria-forge/shared';
