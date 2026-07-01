/**
 * Single-table DynamoDB key design for the AWS-era Soteria Forge platform.
 *
 * One AppSync-backed DynamoDB table holds every entity for every tenant. Items
 * are addressed by a composite primary key:
 *
 *   PK = TENANT#<tenantId>
 *   SK = TENANT#META
 *      | USER#<userId>
 *      | COURSE#<courseId>
 *      | MODULE#<courseId>#<moduleId>
 *      | LESSON#<courseId>#<moduleId>#<lessonId>
 *      | ENROLLMENT#<userId>#<courseId>
 *      | STMT#<statementId>     (xAPI completion statement, append-only)
 *      | VIDEO#<videoId>        (VideoAsset METADATA only — never video bytes)
 *
 * The partition key is ALWAYS the tenant. Because every item for a tenant shares
 * PK = TENANT#<tenantId>, a single Query on the partition returns that tenant's
 * data and nothing else — which is exactly what makes the tenant-isolation
 * invariant enforceable at the data layer. See tenant.ts for the guard that
 * resolvers/authorizers call before touching a partition.
 *
 * GSIs to design for (defined in the Amplify data layer, referenced here for
 * documentation): courses-by-tenant, enrollments-by-user, statements-by-user,
 * users-by-tenant.
 */

/** Delimiter between key segments. Kept as a named constant so parsers agree. */
export const KEY_DELIMITER = '#' as const

/** Entity-type discriminators used as the leading SK segment. */
export const SK_PREFIX = {
  tenantMeta: 'TENANT',
  user: 'USER',
  course: 'COURSE',
  module: 'MODULE',
  lesson: 'LESSON',
  enrollment: 'ENROLLMENT',
  statement: 'STMT',
  video: 'VIDEO',
} as const

export type EntityType =
  | 'TENANT_META'
  | 'USER'
  | 'COURSE'
  | 'MODULE'
  | 'LESSON'
  | 'ENROLLMENT'
  | 'STATEMENT'
  | 'VIDEO'

/**
 * A parsed sort key. `entityType` is the discriminated tag; the remaining fields
 * are populated only when relevant to that entity type.
 */
export type ParsedSk = {
  entityType: EntityType
  userId?: string
  courseId?: string
  moduleId?: string
  lessonId?: string
  statementId?: string
  videoId?: string
}

// ---------------------------------------------------------------------------
// Partition key
// ---------------------------------------------------------------------------

/** PK for every item belonging to a tenant: `TENANT#<tenantId>`. */
export function tenantPk(tenantId: string): string {
  assertSegment(tenantId, 'tenantId')
  return `${SK_PREFIX.tenantMeta}${KEY_DELIMITER}${tenantId}`
}

/** Extract the raw tenantId from a partition key, or `null` if it does not match. */
export function parseTenantPk(pk: string): string | null {
  const parts = pk.split(KEY_DELIMITER)
  if (parts.length !== 2 || parts[0] !== SK_PREFIX.tenantMeta) return null
  return parts[1] || null
}

// ---------------------------------------------------------------------------
// Sort keys
// ---------------------------------------------------------------------------

/** SK for the tenant metadata item: `TENANT#META`. */
export function tenantMetaSk(): string {
  return `${SK_PREFIX.tenantMeta}${KEY_DELIMITER}META`
}

/** SK for a user: `USER#<userId>`. */
export function userSk(userId: string): string {
  assertSegment(userId, 'userId')
  return `${SK_PREFIX.user}${KEY_DELIMITER}${userId}`
}

/** SK for a course: `COURSE#<courseId>`. */
export function courseSk(courseId: string): string {
  assertSegment(courseId, 'courseId')
  return `${SK_PREFIX.course}${KEY_DELIMITER}${courseId}`
}

/** SK for a module within a course: `MODULE#<courseId>#<moduleId>`. */
export function moduleSk(courseId: string, moduleId: string): string {
  assertSegment(courseId, 'courseId')
  assertSegment(moduleId, 'moduleId')
  return `${SK_PREFIX.module}${KEY_DELIMITER}${courseId}${KEY_DELIMITER}${moduleId}`
}

/** SK for a lesson: `LESSON#<courseId>#<moduleId>#<lessonId>`. */
export function lessonSk(courseId: string, moduleId: string, lessonId: string): string {
  assertSegment(courseId, 'courseId')
  assertSegment(moduleId, 'moduleId')
  assertSegment(lessonId, 'lessonId')
  return `${SK_PREFIX.lesson}${KEY_DELIMITER}${courseId}${KEY_DELIMITER}${moduleId}${KEY_DELIMITER}${lessonId}`
}

/** SK for an enrollment: `ENROLLMENT#<userId>#<courseId>`. */
export function enrollmentSk(userId: string, courseId: string): string {
  assertSegment(userId, 'userId')
  assertSegment(courseId, 'courseId')
  return `${SK_PREFIX.enrollment}${KEY_DELIMITER}${userId}${KEY_DELIMITER}${courseId}`
}

/** SK for an xAPI completion statement: `STMT#<statementId>`. Append-only. */
export function stmtSk(statementId: string): string {
  assertSegment(statementId, 'statementId')
  return `${SK_PREFIX.statement}${KEY_DELIMITER}${statementId}`
}

/** SK for a video asset's METADATA item: `VIDEO#<videoId>`. Never stores bytes. */
export function videoSk(videoId: string): string {
  assertSegment(videoId, 'videoId')
  return `${SK_PREFIX.video}${KEY_DELIMITER}${videoId}`
}

// ---------------------------------------------------------------------------
// SK begins-with prefixes (for GSI / partition Query narrowing)
// ---------------------------------------------------------------------------

/**
 * begins-with prefixes for Query key conditions. e.g. querying all courses in a
 * tenant partition uses `begins_with(SK, courseSkPrefix())`.
 */
export const skPrefixes = {
  user: () => `${SK_PREFIX.user}${KEY_DELIMITER}`,
  course: () => `${SK_PREFIX.course}${KEY_DELIMITER}`,
  module: (courseId: string) => `${SK_PREFIX.module}${KEY_DELIMITER}${courseId}${KEY_DELIMITER}`,
  lesson: (courseId: string, moduleId: string) =>
    `${SK_PREFIX.lesson}${KEY_DELIMITER}${courseId}${KEY_DELIMITER}${moduleId}${KEY_DELIMITER}`,
  enrollment: (userId: string) => `${SK_PREFIX.enrollment}${KEY_DELIMITER}${userId}${KEY_DELIMITER}`,
  statement: () => `${SK_PREFIX.statement}${KEY_DELIMITER}`,
  video: () => `${SK_PREFIX.video}${KEY_DELIMITER}`,
} as const

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse any sort key produced by the builders above back into its structured
 * form. Returns `null` for unrecognized shapes. Round-trips with every builder:
 * for a builder output `sk`, `parseSk(sk)` yields the same fields that were
 * passed in.
 */
export function parseSk(sk: string): ParsedSk | null {
  const parts = sk.split(KEY_DELIMITER)
  const [prefix] = parts

  switch (prefix) {
    case SK_PREFIX.tenantMeta:
      if (parts.length === 2 && parts[1] === 'META') {
        return { entityType: 'TENANT_META' }
      }
      return null

    case SK_PREFIX.user:
      if (parts.length === 2 && parts[1]) {
        return { entityType: 'USER', userId: parts[1] }
      }
      return null

    case SK_PREFIX.course:
      if (parts.length === 2 && parts[1]) {
        return { entityType: 'COURSE', courseId: parts[1] }
      }
      return null

    case SK_PREFIX.module:
      if (parts.length === 3 && parts[1] && parts[2]) {
        return { entityType: 'MODULE', courseId: parts[1], moduleId: parts[2] }
      }
      return null

    case SK_PREFIX.lesson:
      if (parts.length === 4 && parts[1] && parts[2] && parts[3]) {
        return { entityType: 'LESSON', courseId: parts[1], moduleId: parts[2], lessonId: parts[3] }
      }
      return null

    case SK_PREFIX.enrollment:
      if (parts.length === 3 && parts[1] && parts[2]) {
        return { entityType: 'ENROLLMENT', userId: parts[1], courseId: parts[2] }
      }
      return null

    case SK_PREFIX.statement:
      if (parts.length === 2 && parts[1]) {
        return { entityType: 'STATEMENT', statementId: parts[1] }
      }
      return null

    case SK_PREFIX.video:
      if (parts.length === 2 && parts[1]) {
        return { entityType: 'VIDEO', videoId: parts[1] }
      }
      return null

    default:
      return null
  }
}

/**
 * The full primary key for an item. Convenience wrapper so callers pass a single
 * object to DynamoDB / AppSync resolvers.
 */
export type PrimaryKey = { PK: string; SK: string }

/** Build a `{ PK, SK }` pair. `sk` is any builder output (or `tenantMetaSk()`). */
export function primaryKey(tenantId: string, sk: string): PrimaryKey {
  return { PK: tenantPk(tenantId), SK: sk }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Reject empty ids and ids that contain the delimiter — a raw `#` in an id would
 * silently corrupt parsing and, worse, could be used to forge a key that crosses
 * an entity boundary. Fail loud instead.
 */
function assertSegment(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Key segment "${field}" must be a non-empty string`)
  }
  if (value.includes(KEY_DELIMITER)) {
    throw new Error(`Key segment "${field}" must not contain the "${KEY_DELIMITER}" delimiter`)
  }
}
