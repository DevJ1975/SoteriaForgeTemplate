/**
 * Unit tests for the lesson-content contract (parser + quiz scoring).
 *
 * Runner: node:test (built in). After `tsc` emits to dist/, run with
 * `node --test dist/__tests__/lessonContent.test.js`. Assertions use
 * node:assert/strict only.
 *
 * Coverage:
 *   - parseLessonContent: tolerant drops (bad questions, <2 choices, unmatched
 *     correctChoiceId), empty/malformed input, body + passingScore extraction
 *   - scoreQuiz: 0 / partial / full, empty quiz -> 0
 *   - resolvePassingScore precedence + DEFAULT_PASSING_SCORE
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseLessonContent,
  scoreQuiz,
  resolvePassingScore,
  DEFAULT_PASSING_SCORE,
  type QuizQuestion,
} from '../index.js'

// ---------------------------------------------------------------------------
// parseLessonContent — tolerant parsing
// ---------------------------------------------------------------------------

test('parseLessonContent: {} (server default) -> empty content', () => {
  const c = parseLessonContent({})
  assert.deepEqual(c.questions, [])
  assert.equal(c.body, undefined)
  assert.equal(c.passingScore, undefined)
})

test('parseLessonContent: non-object / malformed input -> empty questions', () => {
  for (const raw of [null, undefined, 42, 'nope', [], [1, 2, 3]]) {
    const c = parseLessonContent(raw)
    assert.deepEqual(c.questions, [], `raw=${JSON.stringify(raw)}`)
  }
})

test('parseLessonContent: extracts body + passingScore', () => {
  const c = parseLessonContent({ body: 'Read this', passingScore: 90, questions: [] })
  assert.equal(c.body, 'Read this')
  assert.equal(c.passingScore, 90)
})

test('parseLessonContent: blank body and out-of-range passingScore are dropped', () => {
  const c = parseLessonContent({ body: '   ', passingScore: 150, questions: [] })
  assert.equal(c.body, undefined)
  assert.equal(c.passingScore, undefined)

  const negative = parseLessonContent({ passingScore: -1, questions: [] })
  assert.equal(negative.passingScore, undefined)
})

test('parseLessonContent: keeps a well-formed question', () => {
  const c = parseLessonContent({
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
  })
  assert.equal(c.questions.length, 1)
  assert.equal(c.questions[0].id, 'q1')
  assert.equal(c.questions[0].correctChoiceId, 'a')
  assert.equal(c.questions[0].choices.length, 2)
})

test('parseLessonContent: drops a question with fewer than 2 choices', () => {
  const c = parseLessonContent({
    questions: [
      {
        prompt: 'Single choice?',
        choices: [{ id: 'a', text: 'only one' }],
        correctChoiceId: 'a',
      },
    ],
  })
  assert.deepEqual(c.questions, [])
})

test('parseLessonContent: drops a question whose correctChoiceId matches no choice', () => {
  const c = parseLessonContent({
    questions: [
      {
        prompt: 'Unanswerable?',
        choices: [
          { id: 'a', text: 'a' },
          { id: 'b', text: 'b' },
        ],
        correctChoiceId: 'zzz',
      },
    ],
  })
  assert.deepEqual(c.questions, [])
})

test('parseLessonContent: drops a question with a blank prompt', () => {
  const c = parseLessonContent({
    questions: [
      {
        prompt: '  ',
        choices: [
          { id: 'a', text: 'a' },
          { id: 'b', text: 'b' },
        ],
        correctChoiceId: 'a',
      },
    ],
  })
  assert.deepEqual(c.questions, [])
})

test('parseLessonContent: keeps good questions, drops bad ones in the same array', () => {
  const c = parseLessonContent({
    questions: [
      { prompt: 'bad', choices: [{ id: 'a', text: 'a' }], correctChoiceId: 'a' },
      {
        prompt: 'good',
        choices: [
          { id: 'a', text: 'a' },
          { id: 'b', text: 'b' },
        ],
        correctChoiceId: 'b',
      },
    ],
  })
  assert.equal(c.questions.length, 1)
  assert.equal(c.questions[0].prompt, 'good')
})

test('parseLessonContent: synthesizes ids for id-less questions and choices', () => {
  const c = parseLessonContent({
    questions: [
      {
        prompt: 'No ids',
        choices: [{ text: 'first' }, { text: 'second' }],
        correctChoiceId: 'c1',
      },
    ],
  })
  assert.equal(c.questions.length, 1)
  assert.equal(c.questions[0].id, 'q1')
  assert.deepEqual(
    c.questions[0].choices.map((ch) => ch.id),
    ['c1', 'c2'],
  )
  assert.equal(c.questions[0].correctChoiceId, 'c1')
})

test('parseLessonContent: skips choices with blank text before the 2-choice check', () => {
  const c = parseLessonContent({
    questions: [
      {
        prompt: 'Filtered choices',
        choices: [
          { id: 'a', text: 'kept' },
          { id: 'b', text: '   ' },
        ],
        correctChoiceId: 'a',
      },
    ],
  })
  // Only one usable choice remains -> dropped.
  assert.deepEqual(c.questions, [])
})

// ---------------------------------------------------------------------------
// scoreQuiz — pure scoring
// ---------------------------------------------------------------------------

const QUIZ: QuizQuestion[] = [
  { id: 'q1', prompt: 'p1', choices: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctChoiceId: 'a' },
  { id: 'q2', prompt: 'p2', choices: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctChoiceId: 'b' },
  { id: 'q3', prompt: 'p3', choices: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctChoiceId: 'a' },
  { id: 'q4', prompt: 'p4', choices: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctChoiceId: 'b' },
]

test('scoreQuiz: full marks -> 100', () => {
  const s = scoreQuiz(QUIZ, { q1: 'a', q2: 'b', q3: 'a', q4: 'b' })
  assert.deepEqual(s, { total: 4, correct: 4, score: 100 })
})

test('scoreQuiz: partial -> rounded percent', () => {
  const s = scoreQuiz(QUIZ, { q1: 'a', q2: 'b', q3: 'b', q4: 'a' })
  assert.deepEqual(s, { total: 4, correct: 2, score: 50 })
})

test('scoreQuiz: zero correct -> 0', () => {
  const s = scoreQuiz(QUIZ, { q1: 'b', q2: 'a', q3: 'b', q4: 'a' })
  assert.deepEqual(s, { total: 4, correct: 0, score: 0 })
})

test('scoreQuiz: missing answers count as wrong', () => {
  const s = scoreQuiz(QUIZ, { q1: 'a' })
  assert.deepEqual(s, { total: 4, correct: 1, score: 25 })
})

test('scoreQuiz: empty quiz -> 0 (nothing demonstrated), no divide-by-zero', () => {
  const s = scoreQuiz([], {})
  assert.deepEqual(s, { total: 0, correct: 0, score: 0 })
})

test('scoreQuiz: rounds to nearest integer percent', () => {
  const three = QUIZ.slice(0, 3)
  const s = scoreQuiz(three, { q1: 'a', q2: 'b', q3: 'b' })
  // 2/3 = 66.66… -> 67
  assert.equal(s.score, 67)
})

// ---------------------------------------------------------------------------
// resolvePassingScore — precedence
// ---------------------------------------------------------------------------

test('resolvePassingScore: lesson row wins over content and default', () => {
  assert.equal(resolvePassingScore(70, 90), 70)
})

test('resolvePassingScore: content value used when lesson row absent', () => {
  assert.equal(resolvePassingScore(undefined, 90), 90)
})

test('resolvePassingScore: platform default when neither set', () => {
  assert.equal(resolvePassingScore(undefined, undefined), DEFAULT_PASSING_SCORE)
  assert.equal(DEFAULT_PASSING_SCORE, 80)
})

test('resolvePassingScore: an explicit 0 threshold is honored (nullish, not falsy)', () => {
  assert.equal(resolvePassingScore(0, 90), 0)
  assert.equal(resolvePassingScore(undefined, 0), 0)
})
