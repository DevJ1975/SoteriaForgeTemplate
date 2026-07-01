/**
 * Thin AppSync / Amplify Data client wrapper.
 *
 * This module is the ONLY place feature code talks to the backend. It exists to
 * enforce two things the rest of the app should never have to think about:
 *
 *   1. TENANT SCOPING. Every method takes a `tenantId` that the caller obtained
 *      from the verified token (via `useTenantId()`), and passes it through as a
 *      filter/argument. The server is the real enforcement point — the Lambda
 *      authorizer + resolvers compare the caller's `custom:tenantId` claim to the
 *      partition and refuse cross-tenant access (see backend/ + shared/tenant.ts).
 *      Sending the tenantId here is a convenience/consistency layer, NOT the
 *      security boundary: a forged tenantId in an arg is rejected server-side.
 *
 *   2. TYPING against `@soteria-forge/shared`. Query results are mapped to the
 *      canonical domain records so screens depend on the shared contract, not on
 *      the raw GraphQL shape.
 *
 * The generated Amplify Data client (`generateClient<Schema>()`) needs the
 * backend's `Schema` type + a configured Amplify. Neither exists until the
 * backend is deployed. So this wrapper is written against the shared domain
 * types and returns typed data through a single `runQuery` seam that will be
 * pointed at the real client once `backend/` ships. Until then it throws a clear
 * BackendNotConfiguredError so the shell degrades predictably instead of
 * silently returning fake data.
 */
import {
  skPrefixes,
  courseSk,
  type CourseRecord,
  type EnrollmentRecord,
} from '@soteria-forge/shared';

/** Thrown when the data client is called before the backend is wired up. */
export class BackendNotConfiguredError extends Error {
  readonly code = 'BACKEND_NOT_CONFIGURED' as const;
  constructor() {
    super(
      'AppSync backend is not configured yet. Deploy backend/ (or run `npx ampx sandbox`) ' +
        'to generate amplify_outputs.json, then wire generateClient<Schema>() into dataClient.ts.',
    );
    this.name = 'BackendNotConfiguredError';
    Object.setPrototypeOf(this, BackendNotConfiguredError.prototype);
  }
}

/**
 * A request already narrowed to a single tenant partition. Constructing one of
 * these requires a tenantId, which is how we make "unscoped query" unspellable
 * at the type level.
 */
interface TenantScopedRequest {
  /** PK the query targets: TENANT#<tenantId>. Always the caller's own tenant. */
  readonly tenantId: string;
  /** begins_with(SK, …) narrowing for the entity being read. */
  readonly skBeginsWith: string;
}

/**
 * Low-level execution seam. Once the backend exists this delegates to the
 * generated client, e.g.:
 *
 *   const client = generateClient<Schema>();
 *   const { data } = await client.models.<Model>.list({ filter: { tenantId: { eq: req.tenantId } } });
 *
 * For now it throws BackendNotConfiguredError. Keeping the seam here means the
 * screens/hooks above are already written against the final async shape.
 */
async function runQuery<T>(_req: TenantScopedRequest): Promise<T[]> {
  throw new BackendNotConfiguredError();
}

async function runGet<T>(_req: TenantScopedRequest & { sk: string }): Promise<T | null> {
  throw new BackendNotConfiguredError();
}

/**
 * The tenant-scoped data client. Obtain one with `getDataClient(tenantId)` where
 * `tenantId` is the verified token claim. Every method is implicitly scoped to
 * that tenant — there is no method that reads across tenants.
 */
export interface DataClient {
  readonly tenantId: string;
  /** List THIS tenant's courses (GSI: courses-by-tenant). */
  listCourses(): Promise<CourseRecord[]>;
  /** Fetch one course header by id, within this tenant. */
  getCourse(courseId: string): Promise<CourseRecord | null>;
  /** List the signed-in user's enrollments within this tenant (GSI: enrollments-by-user). */
  listEnrollmentsForUser(userId: string): Promise<EnrollmentRecord[]>;
}

export function getDataClient(tenantId: string): DataClient {
  if (!tenantId) {
    // Defense in depth: never build a client without a tenant scope.
    throw new Error('getDataClient requires a non-empty tenantId (from the verified token).');
  }

  return {
    tenantId,

    listCourses() {
      return runQuery<CourseRecord>({ tenantId, skBeginsWith: skPrefixes.course() });
    },

    getCourse(courseId: string) {
      return runGet<CourseRecord>({
        tenantId,
        skBeginsWith: skPrefixes.course(),
        sk: courseSk(courseId),
      });
    },

    listEnrollmentsForUser(userId: string) {
      return runQuery<EnrollmentRecord>({
        tenantId,
        skBeginsWith: skPrefixes.enrollment(userId),
      });
    },
  };
}
