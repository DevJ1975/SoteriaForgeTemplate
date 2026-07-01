import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { tenantAuthorizer } from '../functions/tenant-authorizer/resource.js'
import { tenantStamp } from '../functions/tenant-stamp/resource.js'
import { mediaUrl } from '../functions/media-url/resource.js'

/**
 * Code-first data layer for the AWS-era Soteria Forge platform.
 *
 * SINGLE-TABLE INTENT
 * -------------------
 * Conceptually every entity lives in ONE DynamoDB table keyed by:
 *   PK = TENANT#<tenantId>
 *   SK = TENANT#META | USER#<id> | COURSE#<id> | MODULE#<courseId>#<id>
 *      | LESSON#<courseId>#<moduleId>#<id> | ENROLLMENT#<userId>#<courseId>
 *      | STMT#<statementId> | VIDEO#<videoId>
 * (see @soteria-forge/shared keys.ts for the canonical builders: tenantPk,
 * userSk, courseSk, moduleSk, lessonSk, enrollmentSk, stmtSk, videoSk.)
 *
 * Amplify's `a.schema` provisions one DynamoDB table PER MODEL, not a literal
 * single table. We honor the single-table DESIGN INTENT at the field/auth/index
 * level instead:
 *   - EVERY model carries `tenantId` — the partition owner (PK = TENANT#<id>).
 *   - Ids are shaped to compose the intended sort keys (e.g. a Module knows its
 *     `courseId`; a Lesson knows `courseId` + `moduleId`), so a migration to a
 *     hand-rolled single table maps 1:1 onto the shared key builders.
 *   - Secondary indexes reproduce the required access patterns:
 *     courses-by-tenant, enrollments-by-user, statements-by-user, users-by-tenant.
 *
 * TENANT ISOLATION (the #1 rule) — enforced ROW-LEVEL by AppSync itself:
 *
 *   The load-bearing control is DYNAMIC-GROUP authorization keyed on each row's
 *   own `tenantId`. On EVERY model the base gate is
 *     allow.groupDefinedIn('tenantId').to(['read'])
 *   which means: the record's `tenantId` value must be one of the CALLER's
 *   `cognito:groups`. The pre-token-generation trigger injects the caller's
 *   verified `custom:tenantId` into `cognito:groups`, and a caller's groups only
 *   ever contain their OWN tenantId — so a worker/supervisor/tenant-admin can
 *   NEVER read another tenant's row. This closes the cross-tenant READ hole that
 *   plain `allow.authenticated().to(['read'])` left open (that rule let ANY
 *   authenticated user from ANY tenant read ANY row).
 *
 *   WRITES for admin-authored models and roster/assignment changes are granted
 *   via a TENANT-SCOPED admin group — NOT the tenant-blind `allow.group(
 *   'tenant-admin')` (which is the same Cognito group in every tenant and would
 *   permit cross-tenant WRITE). Those models carry an `adminGroup` field and use
 *     allow.groupDefinedIn('adminGroup').to(['create','update','delete'])
 *   The trigger injects `admin::<tenantId>` into a tenant-admin's groups, so a
 *   caller can only write rows whose `adminGroup` is their own tenant's admin
 *   group.
 *
 *   OWNER rules (User read-own, Enrollment read/update-own, CompletionStatement
 *   create+read-own) remain and are tenant-safe: a user only ever owns their own
 *   rows (`userId` == Cognito `sub`, pinned via `.identityClaim('sub')`).
 *
 *   `super-admin` is the legitimately GLOBAL platform operator and keeps a
 *   cross-tenant grant on the models (except CompletionStatement, which stays
 *   read-only for everyone to preserve append-only).
 *
 * WHERE THE LAMBDA AUTHORIZER FITS (defense-in-depth ONLY):
 *   The `functions/tenant-authorizer` Lambda is NOT the model read gate — an
 *   AppSync Lambda authorizer is request-level (it runs before resolution and
 *   cannot see per-row data), so it cannot do row-level tenant filtering. It is
 *   available as OPTIONAL defense-in-depth for specific CUSTOM operations
 *   (e.g. tenant-checked signed-URL minting / offline-sync stamping) that choose
 *   the `lambda` auth mode. The row-level isolation above does not depend on it.
 *   See data/tenant-isolation.md.
 *
 * SERVER-SIDE TENANT STAMP (residual now CLOSED):
 *   `tenantId` and `adminGroup` are stamped SERVER-SIDE from the caller's verified
 *   `custom:tenantId` claim by the `create*Stamped` custom mutations (backed by
 *   the `tenant-stamp` Lambda). Admin authoring + roster changes go through those
 *   mutations, whose handler OVERWRITES both fields via the shared
 *   `stampTenantOwnership` logic (adminGroup === 'admin::' + tenantId), discarding
 *   any client-supplied values and rejecting a create with no verified tenant.
 *   The two isolation fields can therefore never be client-forged or diverge.
 *   (The raw auto-generated `create*` mutations still exist; production clients
 *   call the `*Stamped` variants — the models' `adminGroup` write gate means a
 *   direct `create*` still cannot forge another tenant's row, but only the stamp
 *   guarantees tenantId ≡ adminGroup.)
 *
 * OBJECT-LEVEL (S3) TENANT BOUNDARY (residual now CLOSED):
 *   `getMediaUrl(key, op)` (backed by the `media-url` Lambda) mints a short-lived
 *   pre-signed S3 URL only after proving the requested `media/<kind>/<tenantId>/…`
 *   key belongs to the caller's verified tenant. That mint — not static S3 path
 *   rules — is the enforced object-level boundary. See storage/resource.ts.
 *
 * DEFAULT AUTH MODE = userPool. No apiKey/public access anywhere.
 */

const schema = a
  .schema({
    // =====================================================================
    // Tenant  (SK = TENANT#META)
    // The tenant's own metadata item. Written by the tenant's own admins
    // (tenant-scoped `adminGroup`) or super-admin; readable by any member OF
    // THAT TENANT (row-level via `groupDefinedIn('tenantId')`).
    // =====================================================================
    Tenant: a
      .model({
        // `tenantId` is both the business id and the partition owner. For the
        // Tenant model these coincide (PK = TENANT#<tenantId>, SK = TENANT#META).
        // It also drives the ROW-LEVEL read gate: it must be one of the caller's
        // cognito:groups (the trigger injects the caller's own tenantId).
        tenantId: a.id().required(),
        // Tenant-scoped admin group value: MUST be stamped `admin::<tenantId>` by
        // the create resolver, kept consistent with `tenantId`. Drives the write
        // gate `groupDefinedIn('adminGroup')` so only THIS tenant's admins write.
        adminGroup: a.string(),
        name: a.string().required(),
        slug: a.string().required(),
        domains: a.string().array(),
        status: a.enum(['active', 'trial', 'suspended', 'archived']),
        mode: a.enum(['marketplace', 'dedicated']),
        billingStatus: a.enum([
          'none',
          'incomplete',
          'trialing',
          'active',
          'past_due',
          'canceled',
          'unpaid',
          'manual',
        ]),
        seatLimit: a.integer(),
        // Branding / settings kept as JSON to mirror the shared TenantBranding /
        // TenantSettings shapes without exploding the schema.
        branding: a.json(),
        settings: a.json(),
      })
      .identifier(['tenantId'])
      .authorization((allow) => [
        // ROW-LEVEL read gate: the row's `tenantId` must be one of the caller's
        // groups → a caller only reads their OWN tenant. Closes cross-tenant read.
        allow.groupDefinedIn('tenantId').to(['read']),
        // WRITE via the tenant-scoped admin group (NOT tenant-blind `tenant-admin`)
        // → only this tenant's admins may author this tenant's metadata.
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        // super-admin: legitimately global platform operator.
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // User  (SK = USER#<userId>)
    // Mirrors @soteria-forge/shared UserRecord. `owner` lets a user read their
    // own row; supervisors/admins manage roster within (their) tenant.
    // CONVENTION: `userId` == the Cognito `sub`, so owner rules pin to the `sub`
    // claim (see `.identityClaim('sub')` below and on Enrollment/Statement).
    // GSI: users-by-tenant.
    // =====================================================================
    User: a
      .model({
        userId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side)
        // gating roster writes to THIS tenant's admins only.
        adminGroup: a.string(),
        email: a.email().required(),
        name: a.string().required(),
        // Cognito-group-derived roles (worker/supervisor/tenant-admin/super-admin
        // map to learner/manager/admin/superadmin — see shared roles.ts).
        roles: a.string().array(),
        jobTitle: a.string(),
        department: a.string(),
        crew: a.string(),
        site: a.string(),
        status: a.enum(['active', 'invited', 'disabled']),
      })
      .identifier(['userId'])
      .secondaryIndexes((index) => [
        // users-by-tenant: list a tenant's roster, most-recent first.
        index('tenantId').sortKeys(['name']).name('users-by-tenant').queryField('listUsersByTenant'),
      ])
      .authorization((allow) => [
        // A user can read their OWN record. `userId` is defined to equal the
        // Cognito `sub`, so we pin the owner comparison to the `sub` claim
        // explicitly (rather than the default `sub::username`). Tenant-safe: a
        // user only ever owns their own row.
        allow.ownerDefinedIn('userId').identityClaim('sub').to(['read']),
        // ROW-LEVEL tenant read gate: roster rows are readable only by members of
        // the SAME tenant (row.tenantId ∈ caller groups). Supervisors read their
        // team via this same-tenant read; admins also read via it.
        allow.groupDefinedIn('tenantId').to(['read']),
        // Roster WRITES gated to THIS tenant's admin group (not tenant-blind
        // `tenant-admin`) → a tenant-A admin cannot mutate tenant-B roster.
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // Course  (SK = COURSE#<courseId>)  — mirrors CourseRecord.
    // GSI: courses-by-tenant.
    // =====================================================================
    Course: a
      .model({
        courseId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side).
        adminGroup: a.string(),
        slug: a.string(),
        title: a.string().required(),
        description: a.string().required(),
        status: a.enum(['draft', 'published', 'archived']),
        tags: a.string().array(),
        category: a.string(),
        durationMinutes: a.integer(),
        passingScore: a.integer(),
        attemptLimit: a.integer(),
        sequenceLocked: a.boolean(),
        certificateLabel: a.string(),
        certificateExpiresInDays: a.integer(),
        fieldReadinessScore: a.integer(),
      })
      .identifier(['courseId'])
      .secondaryIndexes((index) => [
        // courses-by-tenant: the catalog query for a tenant, sortable by status.
        index('tenantId')
          .sortKeys(['status'])
          .name('courses-by-tenant')
          .queryField('listCoursesByTenant'),
      ])
      .authorization((allow) => [
        // ROW-LEVEL read gate: only members of the row's tenant may read the
        // catalog (row.tenantId ∈ caller groups). Closes cross-tenant read.
        allow.groupDefinedIn('tenantId').to(['read']),
        // Authoring gated to THIS tenant's admin group (not tenant-blind
        // `tenant-admin`); supervisors may not author.
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // Module  (SK = MODULE#<courseId>#<moduleId>)  — mirrors ModuleRecord.
    // `courseId` on the row reproduces the composite sort key.
    // =====================================================================
    Module: a
      .model({
        moduleId: a.id().required(),
        courseId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side).
        adminGroup: a.string(),
        title: a.string().required(),
        description: a.string(),
        moduleTopicCode: a.string(),
        sequence: a.integer().required(),
        contactHourTargetMinutes: a.integer(),
        minimumSeatTimeMinutes: a.integer(),
        sequenceLocked: a.boolean(),
      })
      .identifier(['moduleId'])
      .secondaryIndexes((index) => [
        // modules-by-course: ordered module list within a course.
        index('courseId')
          .sortKeys(['sequence'])
          .name('modules-by-course')
          .queryField('listModulesByCourse'),
      ])
      .authorization((allow) => [
        // ROW-LEVEL read gate (same-tenant only) + tenant-scoped admin writes.
        allow.groupDefinedIn('tenantId').to(['read']),
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // Lesson  (SK = LESSON#<courseId>#<moduleId>#<lessonId>) — mirrors LessonRecord.
    // Video lessons reference a VideoAsset by `videoId` (metadata only).
    // =====================================================================
    Lesson: a
      .model({
        lessonId: a.id().required(),
        moduleId: a.id().required(),
        courseId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side).
        adminGroup: a.string(),
        kind: a.enum([
          'video',
          'quiz',
          'game',
          'scorm',
          'document',
          'reflection',
          'practical-signoff',
        ]),
        title: a.string().required(),
        description: a.string().required(),
        sequence: a.integer().required(),
        durationMinutes: a.integer().required(),
        required: a.boolean().required(),
        minimumSeatTimeMinutes: a.integer(),
        passingScore: a.integer(),
        attemptLimit: a.integer(),
        // Link to VideoAsset METADATA (never bytes).
        videoId: a.id(),
        studyGuideAssetId: a.string(),
        languageVariants: a.string().array(),
      })
      .identifier(['lessonId'])
      .secondaryIndexes((index) => [
        // lessons-by-module: ordered lesson list within a module.
        index('moduleId')
          .sortKeys(['sequence'])
          .name('lessons-by-module')
          .queryField('listLessonsByModule'),
      ])
      .authorization((allow) => [
        // ROW-LEVEL read gate (same-tenant only) + tenant-scoped admin writes.
        allow.groupDefinedIn('tenantId').to(['read']),
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // Enrollment  (SK = ENROLLMENT#<userId>#<courseId>) — mirrors EnrollmentRecord.
    // Owner (the enrolled worker) reads/updates own progress; supervisors/admins
    // assign and monitor. GSI: enrollments-by-user.
    // =====================================================================
    Enrollment: a
      .model({
        enrollmentId: a.id().required(),
        userId: a.id().required(),
        courseId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side)
        // gating assignment writes to THIS tenant's admins only.
        adminGroup: a.string(),
        status: a.enum(['assigned', 'in-progress', 'completed', 'overdue', 'expired']),
        progress: a.integer().required(),
        assignedAt: a.datetime(),
        dueAt: a.datetime(),
        startedAt: a.datetime(),
        completedAt: a.datetime(),
      })
      .identifier(['enrollmentId'])
      .secondaryIndexes((index) => [
        // enrollments-by-user: "my courses" for a learner; a supervisor viewing a
        // specific report user. Sorted by course for stable listing.
        index('userId')
          .sortKeys(['courseId'])
          .name('enrollments-by-user')
          .queryField('listEnrollmentsByUser'),
        // enrollments-by-course: roster completion view for a course.
        index('courseId').name('enrollments-by-course').queryField('listEnrollmentsByCourse'),
      ])
      .authorization((allow) => [
        // The enrolled worker reads and updates their own progress row. `userId`
        // equals the Cognito `sub`; pin the owner comparison to `sub`. Tenant-safe:
        // a worker only owns their own enrollment rows.
        allow.ownerDefinedIn('userId').identityClaim('sub').to(['read', 'update']),
        // ROW-LEVEL tenant read gate: supervisors/admins monitor enrollments only
        // within their OWN tenant (row.tenantId ∈ caller groups).
        allow.groupDefinedIn('tenantId').to(['read']),
        // Admins assign (create), remediate (update), unassign (delete) — gated to
        // THIS tenant's admin group, never the tenant-blind `tenant-admin` group.
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // CompletionStatement  (SK = STMT#<statementId>) — the xAPI record.
    //
    // APPEND-ONLY + IDEMPOTENT BY id (mirrors @soteria-forge/shared xapi.ts):
    //   - `id` is the CLIENT-GENERATED UUID and the model IDENTIFIER, so the
    //     server dedupes by primary key: re-sending the same statement (offline
    //     retry) targets the SAME item — a no-op create, not a duplicate row.
    //   - Auth grants CREATE and READ only. NO update, NO delete are granted to
    //     ANY group (not even super-admin) → statements are immutable once
    //     written. There is no conflict resolution and there never needs to be:
    //     immutability + id-dedupe means two writers can never disagree on an id.
    //   - The create resolver stamps `tenantId` from the caller's VERIFIED claim
    //     and rejects any create whose declared tenant differs (isolation).
    // GSI: statements-by-user.
    // =====================================================================
    CompletionStatement: a
      .model({
        // CLIENT-GENERATED UUID — identifier ⇒ create-only writes dedupe on it.
        id: a.id().required(),
        tenantId: a.id().required(),
        userId: a.id().required(),
        // xAPI payload (actor/verb/object/result/context) as JSON; timestamp is
        // the ACTIVITY time (never a dedupe key — the id is).
        actor: a.json().required(),
        verb: a.json().required(),
        object: a.json().required(),
        result: a.json(),
        context: a.json(),
        timestamp: a.datetime().required(),
        // Optional denormalized links for reporting/join-free reads.
        courseId: a.id(),
        lessonId: a.id(),
      })
      .identifier(['id'])
      .secondaryIndexes((index) => [
        // statements-by-user: a learner's completion history; supervisor reports.
        index('userId')
          .sortKeys(['timestamp'])
          .name('statements-by-user')
          .queryField('listStatementsByUser'),
      ])
      .authorization((allow) => [
        // Learners APPEND their own statements and read their own history.
        // NOTE: only 'create' and 'read' — never 'update'/'delete' → append-only.
        // `userId` equals the Cognito `sub`; pin the owner comparison to `sub`.
        allow.ownerDefinedIn('userId').identityClaim('sub').to(['create', 'read']),
        // ROW-LEVEL tenant read gate: supervisors/admins read team/tenant history
        // only within their OWN tenant (row.tenantId ∈ caller groups). READ-ONLY —
        // deliberately NO adminGroup write rule here so the append-only invariant
        // holds even for a tenant's own admins (no update/delete to ANYONE).
        allow.groupDefinedIn('tenantId').to(['read']),
        // super-admin: intentionally READ-ONLY here (not the blanket grant used
        // elsewhere) so the append-only invariant holds even for staff.
        allow.group('super-admin').to(['read']),
      ]),

    // =====================================================================
    // VideoAsset  (SK = VIDEO#<videoId>) — METADATA ONLY, never bytes.
    // Stores the streaming provider's playback id + tenant + course link.
    // Bytes live in S3 / a streaming provider; this row only describes them.
    // =====================================================================
    VideoAsset: a
      .model({
        videoId: a.id().required(),
        tenantId: a.id().required(),
        // Tenant-scoped admin group (`admin::<tenantId>`, stamped server-side).
        adminGroup: a.string(),
        // Course this asset is associated with (link only; not the media).
        courseId: a.id(),
        title: a.string().required(),
        // Streaming playback handle (e.g. Vimeo/Mux/HLS id) — a reference, not bytes.
        providerVideoId: a.string(),
        provider: a.enum(['vimeo', 'mux', 's3-hls', 'other']),
        // Storage locator for the SOURCE object (e.g. an S3 key) — still not bytes.
        storageKey: a.string(),
        durationSeconds: a.integer(),
        captionsAssetKey: a.string(),
        posterKey: a.string(),
        privacyRequired: a.boolean().required(),
        status: a.enum(['processing', 'ready', 'errored']),
      })
      .identifier(['videoId'])
      .secondaryIndexes((index) => [
        // videos-by-tenant: manage a tenant's media library.
        index('tenantId').name('videos-by-tenant').queryField('listVideosByTenant'),
      ])
      .authorization((allow) => [
        // ROW-LEVEL read gate: only members of the row's tenant read metadata to
        // obtain a playback reference (the actual signed URL is minted behind a
        // tenant-checked signed-URL Lambda — see storage/resource.ts).
        allow.groupDefinedIn('tenantId').to(['read']),
        // Media authoring gated to THIS tenant's admin group (not tenant-blind).
        allow.groupDefinedIn('adminGroup').to(['create', 'update', 'delete']),
        allow.group('super-admin'),
      ]),

    // =====================================================================
    // CUSTOM OPERATIONS
    // =====================================================================

    // ---------------------------------------------------------------------
    // Server-side tenant STAMP — create*Stamped mutations (residual CLOSED).
    //
    // These are the WRITE path admin/roster clients use instead of the raw
    // auto-generated `create*`. Each is backed by the `tenant-stamp` Lambda,
    // which reads the caller's VERIFIED `custom:tenantId` from
    // `event.identity.claims` and OVERWRITES `tenantId` + `adminGroup` on the
    // input (adminGroup === 'admin::' + tenantId) BEFORE persisting — so those
    // two isolation fields are never client-supplied and can never diverge.
    //
    // `input` is `a.json()`: the model's create fields. Any `tenantId`/
    // `adminGroup` inside it are IGNORED (the stamp is authoritative). The handler
    // routes to the target model by its own resolver field NAME
    // (`event.info.fieldName`, a server value) — never a client argument — so a
    // caller cannot redirect the create to another model. The stamp rejects a
    // create with no verified tenant (fail closed).
    //
    // NOTE: authorization here only gates WHO may call the mutation; WHICH tenant
    // the row lands in is decided solely by the server-side stamp from the claim.
    // ---------------------------------------------------------------------
    createTenantStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('Tenant'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createUserStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('User'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createCourseStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('Course'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createModuleStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('Module'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createLessonStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('Lesson'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createEnrollmentStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('Enrollment'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),
    createVideoAssetStamped: a
      .mutation()
      .arguments({ input: a.json().required() })
      .returns(a.ref('VideoAsset'))
      .authorization((allow) => [allow.group('tenant-admin'), allow.group('super-admin')])
      .handler(a.handler.function(tenantStamp)),

    // ---------------------------------------------------------------------
    // Tenant-checked S3 signed-URL MINT — getMediaUrl (residual CLOSED).
    //
    // The ENFORCED object-level tenant boundary. Backed by the `media-url`
    // Lambda, which reads the caller's VERIFIED `custom:tenantId` from
    // `event.identity.claims`, parses the requested `media/<kind>/<tenantId>/…`
    // key, and REFUSES to sign unless the key's tenant equals the caller's
    // verified tenant (mismatch OR unparseable key ⇒ deny). Returns a
    // short-lived pre-signed GET/PUT URL for that ONE object. userPool auth: any
    // authenticated member may ASK, but the mint only signs objects their own
    // verified tenant owns — so the grant carries no cross-tenant power.
    // ---------------------------------------------------------------------
    getMediaUrl: a
      .query()
      .arguments({ key: a.string().required(), op: a.string().required() })
      .returns(a.customType({
        url: a.string().required(),
        key: a.string().required(),
        op: a.string().required(),
        expiresInSeconds: a.integer().required(),
      }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(mediaUrl)),
  })
  // Make the Lambda authorizer available as a `lambda` authorization MODE so that
  // future CUSTOM operations (e.g. a tenant-checked signed-URL mint / offline-sync
  // stamping) can opt into it for DEFENSE-IN-DEPTH. It is NOT the model read gate:
  // an AppSync Lambda authorizer is request-level and cannot see per-row data, so
  // it cannot do row-level tenant filtering. ROW-LEVEL tenant isolation on the
  // models above is enforced by `groupDefinedIn('tenantId')` + owner rules; this
  // authorizer binding does not participate in those model reads/writes.
  //
  // `allow.resource(tenantStamp)` grants the STAMP resolver IAM access to the API
  // so its handler can persist the stamped row via the Amplify data client. The
  // stamp is what pins the row to the caller's verified tenant; this grant is the
  // function's data-plane permission, not a relaxation of the model gates.
  .authorization((allow) => [
    allow.resource(tenantAuthorizer),
    allow.resource(tenantStamp),
  ])

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    // DEFAULT = userPool. No API key, no IAM-public, no unauthenticated access.
    // Row-level tenant isolation is enforced by the userPool auth rules on the
    // models (`groupDefinedIn('tenantId')` + owner rules), NOT by the Lambda mode.
    defaultAuthorizationMode: 'userPool',
    // The tenant-isolation authorizer is available as an OPTIONAL Lambda auth mode
    // for CUSTOM operations that want defense-in-depth (a request-level tenant
    // match before resolution). It is not used by the model read/write gates.
    lambdaAuthorizationMode: {
      function: tenantAuthorizer,
      // Short TTL: a grant should not meaningfully outlive tenant/group changes.
      timeToLiveInSeconds: 60,
    },
  },
})
