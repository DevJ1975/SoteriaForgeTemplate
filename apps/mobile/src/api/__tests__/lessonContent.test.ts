/**
 * Tests for the lesson-content contract: defensive parsing of the untyped
 * `lessons.content` jsonb column, on-device quiz scoring, and pass-threshold
 * resolution. Runner: node:test + node:assert/strict (see tsconfig.test.json).
 *
 * The parser's contract is "never crash the player": absent, empty, or
 * malformed content degrades to no body / no questions, and any question that
 * could not be rendered AND scored is dropped rather than shipped unpassable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLessonContent,
  scoreQuiz,
  resolvePassingScore,
  DEFAULT_PASSING_SCORE,
  type QuizQuestion,
} from '../lessonContent';

// ---------------------------------------------------------------------------
// parseLessonContent — garbage in, empty content out (never a throw)
// ---------------------------------------------------------------------------

test('parseLessonContent degrades ALL non-object input to empty content', () => {
  for (const garbage of [null, undefined, 'a string', 42, true, [], [{ body: 'x' }]]) {
    const parsed = parseLessonContent(garbage);
    assert.equal(parsed.body, undefined, `body for ${JSON.stringify(garbage)}`);
    assert.deepEqual(parsed.questions, []);
    assert.equal(parsed.passingScore, undefined);
  }
});

test('parseLessonContent parses the server default {} to "no renderable content"', () => {
  const parsed = parseLessonContent({});
  assert.equal(parsed.body, undefined);
  assert.deepEqual(parsed.questions, []);
  assert.equal(parsed.passingScore, undefined);
});

test('parseLessonContent keeps a valid body and drops blank/non-string ones', () => {
  assert.equal(parseLessonContent({ body: 'Read the LOTO procedure.' }).body, 'Read the LOTO procedure.');
  assert.equal(parseLessonContent({ body: '   ' }).body, undefined);
  assert.equal(parseLessonContent({ body: 7 }).body, undefined);
});

test('parseLessonContent accepts only a sane 0–100 passingScore', () => {
  assert.equal(parseLessonContent({ passingScore: 80 }).passingScore, 80);
  assert.equal(parseLessonContent({ passingScore: 0 }).passingScore, 0);
  assert.equal(parseLessonContent({ passingScore: 100 }).passingScore, 100);
  for (const bad of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, '80', null]) {
    assert.equal(parseLessonContent({ passingScore: bad }).passingScore, undefined, `rejects ${String(bad)}`);
  }
});

test('parseLessonContent parses a fully-valid quiz verbatim', () => {
  const parsed = parseLessonContent({
    body: 'Quiz time.',
    passingScore: 75,
    questions: [
      {
        id: 'q1',
        prompt: 'When must a permit be reissued?',
        choices: [
          { id: 'a', text: 'Every shift change' },
          { id: 'b', text: 'Only after an incident' },
        ],
        correctChoiceId: 'a',
      },
    ],
  });
  assert.equal(parsed.body, 'Quiz time.');
  assert.equal(parsed.passingScore, 75);
  assert.deepEqual(parsed.questions, [
    {
      id: 'q1',
      prompt: 'When must a permit be reissued?',
      choices: [
        { id: 'a', text: 'Every shift change' },
        { id: 'b', text: 'Only after an incident' },
      ],
      correctChoiceId: 'a',
    },
  ]);
});

test('parseLessonContent drops questions that cannot be rendered AND scored, keeps the rest', () => {
  const parsed = parseLessonContent({
    questions: [
      'not an object',
      { prompt: '', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'a' }, // no prompt
      { prompt: 'One choice only?', choices: [{ id: 'a', text: 'A' }], correctChoiceId: 'a' }, // <2 choices
      { prompt: 'No answer key?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, // no correctChoiceId
      { prompt: 'Dangling key?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'zzz' }, // key not a choice
      { prompt: 'Valid.', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'b' },
    ],
  });
  assert.equal(parsed.questions.length, 1, 'only the scoreable question survives');
  assert.equal(parsed.questions[0]?.prompt, 'Valid.');
  assert.equal(parsed.questions[0]?.correctChoiceId, 'b');
});

test('parseLessonContent fills in stable fallback ids and skips unusable choices', () => {
  const parsed = parseLessonContent({
    questions: [
      {
        // no question id → q<index+1>
        prompt: 'Pick one.',
        choices: [
          { text: 'first' }, // no id → c1
          'garbage', // dropped
          { id: 'x', text: '' }, // blank text → dropped
          { id: 'real', text: 'second' },
        ],
        correctChoiceId: 'real',
      },
    ],
  });
  const q = parsed.questions[0];
  assert.ok(q);
  assert.equal(q.id, 'q1');
  assert.deepEqual(q.choices, [
    { id: 'c1', text: 'first' },
    { id: 'real', text: 'second' },
  ]);
});

test('parseLessonContent: fallback choice ids can never orphan the answer key', () => {
  // The fallback id is c<original index+1>; if the correct choice's id was
  // omitted, the key cannot reference it and the question must be dropped
  // rather than shipped unpassable.
  const parsed = parseLessonContent({
    questions: [
      {
        prompt: 'Which?',
        choices: [{ text: 'A' }, { text: 'B' }],
        correctChoiceId: 'a-key-that-matches-nothing',
      },
    ],
  });
  assert.deepEqual(parsed.questions, []);
});

// ---------------------------------------------------------------------------
// scoreQuiz — pure scoring, boundaries included
// ---------------------------------------------------------------------------

const QUESTIONS: QuizQuestion[] = [
  { id: 'q1', prompt: 'P1', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'a' },
  { id: 'q2', prompt: 'P2', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'b' },
  { id: 'q3', prompt: 'P3', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctChoiceId: 'a' },
];

test('scoreQuiz scores an empty quiz as 0 — nothing was demonstrated', () => {
  assert.deepEqual(scoreQuiz([], {}), { total: 0, correct: 0, score: 0 });
  assert.deepEqual(scoreQuiz([], { q1: 'a' }), { total: 0, correct: 0, score: 0 });
});

test('scoreQuiz: all correct → 100, all wrong → 0', () => {
  assert.deepEqual(scoreQuiz(QUESTIONS, { q1: 'a', q2: 'b', q3: 'a' }), { total: 3, correct: 3, score: 100 });
  assert.deepEqual(scoreQuiz(QUESTIONS, { q1: 'b', q2: 'a', q3: 'b' }), { total: 3, correct: 0, score: 0 });
});

test('scoreQuiz counts unanswered questions as wrong (never as skipped)', () => {
  const partial = scoreQuiz(QUESTIONS, { q1: 'a' }); // q2, q3 unanswered
  assert.deepEqual(partial, { total: 3, correct: 1, score: 33 });
});

test('scoreQuiz rounds to an integer percent', () => {
  assert.equal(scoreQuiz(QUESTIONS, { q1: 'a', q2: 'b' }).score, 67); // 2/3 → 66.67 → 67
  assert.equal(scoreQuiz(QUESTIONS, { q1: 'a' }).score, 33); // 1/3 → 33.33 → 33
});

// ---------------------------------------------------------------------------
// resolvePassingScore + the pass boundary
// ---------------------------------------------------------------------------

test('resolvePassingScore: lesson row wins, then content, then the platform default', () => {
  assert.equal(resolvePassingScore(90, 70), 90);
  assert.equal(resolvePassingScore(undefined, 70), 70);
  assert.equal(resolvePassingScore(undefined, undefined), DEFAULT_PASSING_SCORE);
});

test('resolvePassingScore treats 0 as a REAL threshold, not as absent', () => {
  // ?? semantics: an authored 0 ("attendance quiz") must not fall through to 80.
  assert.equal(resolvePassingScore(0, 70), 0);
  assert.equal(resolvePassingScore(undefined, 0), 0);
});

test('the exact pass mark passes; one point under fails (boundary contract)', () => {
  // 2 of 3 correct = 67. The UI's pass rule is `score >= passingScore`.
  const { score } = scoreQuiz(QUESTIONS, { q1: 'a', q2: 'b' });
  assert.equal(score >= resolvePassingScore(67, undefined), true, 'exact mark passes');
  assert.equal(score >= resolvePassingScore(68, undefined), false, 'one under fails');
});
