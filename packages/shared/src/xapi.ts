/**
 * xAPI completion statements — the append-only, idempotent record of learning
 * activity.
 *
 * CONTRACT:
 *   A completion statement is {
 *     id (CLIENT-GENERATED UUID), tenantId, actor, verb, object, result?,
 *     context?, timestamp
 *   }.
 *   - APPEND-ONLY: statements are never mutated or deleted after write.
 *   - IDEMPOTENT BY id: the client generates the UUID; the server dedupes on it.
 *     Re-sending the same statement (offline retry, flaky network) is a no-op.
 *   - There is NO conflict resolution and there must never need to be — because
 *     the id is the dedupe key and statements are immutable, two writers can
 *     never disagree about the same id.
 *
 * The client generates the id so that an offline device can create a statement,
 * queue it, and sync later with a stable identity. In the Supabase schema the id
 * is the PRIMARY KEY of `completion_statements` (append-only), so the same id
 * dedupes idempotently on sync — `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`.
 */

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

/**
 * Canonical verb IRIs. The original set is preserved verbatim; the AWS-era plan
 * adds `startedModule` (module begun) and `watchedVideoSegment` (a played span
 * of a VideoAsset) so mobile can report granular progress.
 */
export const xapiVerbs = {
  launched: 'http://adlnet.gov/expapi/verbs/launched',
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  experienced: 'http://adlnet.gov/expapi/verbs/experienced',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  progressed: 'https://w3id.org/xapi/video/verbs/progressed',
  played: 'https://w3id.org/xapi/video/verbs/played',
  paused: 'https://w3id.org/xapi/video/verbs/paused',
  // AWS-era additions:
  /** Learner began a module. */
  startedModule: 'http://adlnet.gov/expapi/verbs/attempted',
  /** Learner watched a segment of a video (reported with result.extensions span). */
  watchedVideoSegment: 'https://w3id.org/xapi/video/verbs/watched',
} as const

export type XapiVerbKey = keyof typeof xapiVerbs

// ---------------------------------------------------------------------------
// Statement shape
// ---------------------------------------------------------------------------

export type XapiActor = {
  account?: {
    homePage: string
    name: string
  }
  mbox?: string
  name: string
}

export type XapiVerb = {
  id: string
  display: Record<string, string>
}

export type XapiObject = {
  id: string
  definition?: {
    name?: Record<string, string>
    description?: Record<string, string>
    type?: string
  }
}

export type XapiResult = {
  score?: {
    scaled?: number
    raw?: number
    min?: number
    max?: number
  }
  completion?: boolean
  success?: boolean
  duration?: string
  response?: string
  /** Free-form extensions, e.g. watched video segment start/end seconds. */
  extensions?: Record<string, unknown>
}

/**
 * A full xAPI statement as stored. `stored` is the server-assigned write time and
 * is the ONLY field the server sets; everything else is client-authored and
 * immutable. `id` is the client-generated UUID and the idempotency key.
 */
export type XapiStatement = {
  id: string
  tenantId: string
  actor: XapiActor
  verb: XapiVerb
  object: XapiObject
  result?: XapiResult
  context?: Record<string, unknown>
  timestamp: string
  /** Server-assigned on first write. Absent on client-authored statements. */
  stored?: string
}

/**
 * The subset of an xAPI statement that specifically records a course/lesson
 * COMPLETION. It is an ordinary `XapiStatement` narrowed so `verb` is a
 * completion-style verb and `result.completion` is set. Kept as a distinct type
 * so completion-oriented code (certificates, progress) can be explicit.
 */
export type CompletionStatement = XapiStatement & {
  verb: XapiVerb & { id: typeof xapiVerbs.completed | typeof xapiVerbs.passed | typeof xapiVerbs.failed }
  result: XapiResult & { completion: boolean }
}

// ---------------------------------------------------------------------------
// UUID handling
// ---------------------------------------------------------------------------

/** RFC 4122 UUID (any version) matcher, case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Is `value` a syntactically valid RFC 4122 UUID? */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Produce a client-generated UUID for a statement id.
 *
 * Prefers the platform crypto RNG (`crypto.randomUUID`) which is available in
 * Node 19+, modern browsers, React Native (with a polyfill), and Lambda. This is
 * deliberately NOT a `Date.now()`+`Math.random()` scheme: those collide under
 * clock skew and concurrent generation, which would break idempotency. If no
 * crypto source exists at all, we throw rather than emit a weak, collision-prone
 * id — callers should pass an explicit id in that case.
 */
export function generateStatementId(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined

  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    return uuidFromRandomBytes((size) => {
      const bytes = new Uint8Array(size)
      cryptoObj.getRandomValues(bytes)
      return bytes
    })
  }

  throw new Error(
    'No secure crypto source available to generate a statement UUID. ' +
      'Pass an explicit `id` (a client-generated UUID) to createCompletionStatement().',
  )
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type CreateCompletionStatementInput = {
  /**
   * The CLIENT-GENERATED UUID. If provided it is validated and used as-is (this
   * is what makes offline retries idempotent — reuse the SAME id on retry). If
   * omitted, a fresh crypto UUID is generated.
   */
  id?: string
  tenantId: string
  actor: XapiActor
  verb: XapiVerb
  object: XapiObject
  result?: XapiResult
  context?: Record<string, unknown>
  /** ISO-8601 activity time. Defaults to now. This is the ACTIVITY time, not a dedupe key. */
  timestamp?: string
}

/**
 * Build a completion statement with a stable, client-generated UUID id.
 *
 * The id — not the timestamp — is the idempotency key. `timestamp` only records
 * when the activity happened and is never used for deduplication, so re-building
 * a statement with the same `id` yields the same identity even if the clock has
 * moved. When `id` is supplied it is validated as a UUID and thrown on if
 * malformed, so a bad id fails fast instead of corrupting the dedupe key.
 */
export function createCompletionStatement(input: CreateCompletionStatementInput): XapiStatement {
  let id: string
  if (input.id !== undefined) {
    if (!isUuid(input.id)) {
      throw new Error(`Statement id must be a valid UUID, received: ${JSON.stringify(input.id)}`)
    }
    id = input.id
  } else {
    id = generateStatementId()
  }

  return {
    id,
    tenantId: input.tenantId,
    actor: input.actor,
    verb: input.verb,
    object: input.object,
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
    timestamp: input.timestamp ?? new Date().toISOString(),
  }
}

/**
 * Legacy builder retained for backward compatibility with existing callers.
 *
 * Prefer {@link createCompletionStatement}. Unlike the completion builder, this
 * accepts a non-UUID fallback id for callers that predate the UUID contract; new
 * code should always supply/generate a real UUID.
 */
export function createXapiStatement(
  input: Omit<XapiStatement, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
): XapiStatement {
  return {
    ...input,
    id: input.id ?? safeStatementId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  }
}

/**
 * The idempotency key for a statement IS its id. This helper documents that
 * intent and gives the sync layer a single stable place to derive the dedupe
 * key from, so it can never accidentally key on the timestamp or payload hash.
 */
export function statementIdempotencyKey(statement: Pick<XapiStatement, 'id'>): string {
  return statement.id
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Best-effort id for the legacy builder: crypto UUID if available, else a tagged fallback. */
function safeStatementId(): string {
  try {
    return generateStatementId()
  } catch {
    return `stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/** Assemble an RFC 4122 v4 UUID from 16 random bytes. */
function uuidFromRandomBytes(fill: (size: number) => Uint8Array): string {
  const bytes = fill(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex: string[] = []
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1))
  return (
    hex[bytes[0]] +
    hex[bytes[1]] +
    hex[bytes[2]] +
    hex[bytes[3]] +
    '-' +
    hex[bytes[4]] +
    hex[bytes[5]] +
    '-' +
    hex[bytes[6]] +
    hex[bytes[7]] +
    '-' +
    hex[bytes[8]] +
    hex[bytes[9]] +
    '-' +
    hex[bytes[10]] +
    hex[bytes[11]] +
    hex[bytes[12]] +
    hex[bytes[13]] +
    hex[bytes[14]] +
    hex[bytes[15]]
  )
}
