/**
 * Lesson content — the mobile app's typed view over the `lessons.content`
 * jsonb column.
 *
 * PROVENANCE / SHAPE: the console's authoring flow currently writes NO content
 * (the column defaults to `'{}'::jsonb` server-side), so this module — not
 * `@soteria-forge/shared` — defines the app's minimal content contract and
 * parses it DEFENSIVELY: absent, empty, or malformed content degrades to "no
 * renderable content" (the player falls back to the lesson description +
 * mark-complete flow) instead of ever crashing the player. The documented
 * shape, which future console authoring should write:
 *
 * ```jsonc
 * {
 *   // Long-form body text for document / reflection (and any kind, really).
 *   "body": "Read the lockout-tagout procedure below…",
 *
 *   // Quiz lessons additionally carry questions. `correctChoiceId` must
 *   // reference one of the question's choice ids or the question is dropped
 *   // (it could never be scored).
 *   "passingScore": 80,
 *   "questions": [
 *     {
 *       "id": "q1",
 *       "prompt": "When must a permit be reissued?",
 *       "choices": [
 *         { "id": "a", "text": "Every shift change" },
 *         { "id": "b", "text": "Only after an incident" }
 *       ],
 *       "correctChoiceId": "a"
 *     }
 *   ]
 * }
 * ```
 *
 * SCORING NOTE (accepted MVP trade-off): `correctChoiceId` ships inside the
 * RLS-readable content, so quizzes are scored ON DEVICE — which is what makes
 * them work fully offline. A determined worker could inspect the payload;
 * server-side scoring (an edge function) is the future hardening if that risk
 * matters for a tenant. The emitted statement carries result.score +
 * result.success either way, and the append-only record keeps every attempt.
 */

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  /** Must be one of `choices[].id` — enforced by the parser. */
  correctChoiceId: string;
}

export interface LessonContent {
  /** Long-form body text; undefined when the lesson has none authored. */
  body?: string;
  /** Scoreable quiz questions; EMPTY when the lesson has no renderable quiz. */
  questions: QuizQuestion[];
  /** Content-level pass threshold 0–100 (lessons.passing_score wins over it). */
  passingScore?: number;
}

/** The default pass threshold when neither the lesson row nor content set one. */
export const DEFAULT_PASSING_SCORE = 80;

const EMPTY_CONTENT: LessonContent = { questions: [] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asPercent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

/** Parse one raw question; returns null when it cannot be rendered AND scored. */
function parseQuestion(raw: unknown, index: number): QuizQuestion | null {
  const q = asRecord(raw);
  if (!q) return null;
  const prompt = asNonEmptyString(q.prompt);
  if (!prompt) return null;

  const rawChoices = Array.isArray(q.choices) ? q.choices : [];
  const choices: QuizChoice[] = [];
  for (let i = 0; i < rawChoices.length; i++) {
    const c = asRecord(rawChoices[i]);
    if (!c) continue;
    const text = asNonEmptyString(c.text);
    if (!text) continue;
    choices.push({ id: asNonEmptyString(c.id) ?? `c${i + 1}`, text });
  }
  // A single-choice "quiz" question can't discriminate anything — drop it.
  if (choices.length < 2) return null;

  const correctChoiceId = asNonEmptyString(q.correctChoiceId);
  // An unanswerable question must never appear (it would be unpassable).
  if (!correctChoiceId || !choices.some((c) => c.id === correctChoiceId)) return null;

  return {
    id: asNonEmptyString(q.id) ?? `q${index + 1}`,
    prompt,
    choices,
    correctChoiceId,
  };
}

/**
 * Parse the raw jsonb column value into the typed content, tolerantly: any
 * unusable part is dropped rather than thrown on. `{}` (the server default)
 * parses to "no body, no questions".
 */
export function parseLessonContent(raw: unknown): LessonContent {
  const record = asRecord(raw);
  if (!record) return EMPTY_CONTENT;

  const questions: QuizQuestion[] = [];
  if (Array.isArray(record.questions)) {
    for (let i = 0; i < record.questions.length; i++) {
      const parsed = parseQuestion(record.questions[i], i);
      if (parsed) questions.push(parsed);
    }
  }

  return {
    body: asNonEmptyString(record.body),
    questions,
    passingScore: asPercent(record.passingScore),
  };
}

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

export interface QuizScore {
  /** Number of questions scored. */
  total: number;
  /** Number answered with the correct choice. */
  correct: number;
  /** Integer percent 0–100 (0 for an empty quiz — nothing was demonstrated). */
  score: number;
}

/** Score an answer map { questionId → choiceId } against the parsed questions. */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Record<string, string>,
): QuizScore {
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.correctChoiceId).length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, score };
}

/**
 * The pass threshold for a quiz lesson: the lesson row's `passing_score` wins
 * (the console authors it per lesson), then the content-level value, then the
 * platform default.
 */
export function resolvePassingScore(
  lessonPassingScore: number | undefined,
  contentPassingScore: number | undefined,
): number {
  return lessonPassingScore ?? contentPassingScore ?? DEFAULT_PASSING_SCORE;
}
