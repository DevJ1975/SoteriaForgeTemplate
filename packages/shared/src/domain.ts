/**
 * Domain DTOs for Soteria Forge.
 *
 * This module carries forward every DTO and helper the existing console app
 * depends on (nothing here was removed) and ADDS the AWS-era, single-table
 * domain model: Tenant, User, Course, Module, Lesson, Enrollment,
 * CompletionStatement (see xapi.ts), and VideoAsset (metadata only).
 *
 * The AWS-era `*Record` types mirror how entities are stored in the single
 * DynamoDB table: each carries `tenantId` (the partition owner) and, where
 * useful, the derived key fields. The legacy `*DTO` types remain the shape the
 * console and existing services exchange over the wire.
 */

// ===========================================================================
// Carried-forward enums / unions (unchanged surface — do not narrow)
// ===========================================================================

export type TenantStatus = 'active' | 'trial' | 'suspended' | 'archived'
export type TenantMode = 'marketplace' | 'dedicated'
export type BillingStatus = 'none' | 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'manual'
export type UserRole = 'learner' | 'manager' | 'admin' | 'superadmin'
export type CourseStatus = 'draft' | 'published' | 'archived'
export type CommerceStatus = 'draft' | 'active' | 'archived'
export type SubscriptionStatus = 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
export type MarketplaceOrderStatus = 'pending' | 'checkout-created' | 'completed' | 'canceled' | 'failed'
export type LessonKind = 'video' | 'quiz' | 'game' | 'scorm' | 'document' | 'reflection' | 'practical-signoff'
export type EnrollmentStatus = 'assigned' | 'in-progress' | 'completed' | 'overdue' | 'expired'
export type AttemptStatus = 'started' | 'completed' | 'failed' | 'synced' | 'queued'
export type AssetKind = 'vimeo-video' | 'scorm-package' | 'document' | 'thumbnail' | 'offline-bundle'

// ===========================================================================
// Carried-forward DTOs (console-facing wire shapes)
// ===========================================================================

export type TenantBranding = {
  appName: string
  logoUrl?: string
  primaryColor: string
  accentColor: string
}

export type TenantSettings = {
  offlineEnabled: boolean
  lowBandwidthMode: boolean
  vimeoDomainPrivacyRequired: boolean
  defaultCertificateExpiryDays?: number
}

export type TenantDTO = {
  id: string
  name: string
  slug: string
  domains: string[]
  status: TenantStatus
  mode: TenantMode
  billingStatus: BillingStatus
  seatLimit?: number
  marketplaceOriginTenantId?: string
  dedicatedSubdomain?: string
  branding: TenantBranding
  settings: TenantSettings
}

export type UserDTO = {
  id: string
  tenantId: string
  email: string
  name: string
  roles: UserRole[]
  jobTitle?: string
  department?: string
  crew?: string
  site?: string
}

export type AuthSessionDTO = {
  token: string
  user: UserDTO
  tenant: TenantDTO
}

export type CourseLessonDTO = {
  id: string
  kind: LessonKind
  title: string
  description: string
  durationMinutes: number
  required: boolean
  minimumSeatTimeMinutes?: number
  activeEngagementPrompt?: string
  passingScore?: number
  attemptLimit?: number
  languageVariants?: string[]
  vimeoUrl?: string
  assetId?: string
  studyGuideAssetId?: string
  quizQuestions?: QuizQuestionDTO[]
  transcript?: string
  offlineSummary?: string
}

export type CourseModuleDTO = {
  id: string
  title: string
  description?: string
  moduleTopicCode?: string
  contactHourTargetMinutes?: number
  minimumSeatTimeMinutes?: number
  sequenceLocked?: boolean
  lessons: CourseLessonDTO[]
}

export type CourseDTO = {
  id: string
  tenantId: string
  slug?: string
  title: string
  description: string
  publicSummary?: string
  audience?: string[]
  outcomes?: string[]
  category?: string
  role?: string
  topic?: string
  durationMinutes?: number
  certificateLabel?: string
  complianceDisclaimers?: string[]
  contactHourTargetMinutes?: number
  sequenceLocked?: boolean
  passingScore?: number
  attemptLimit?: number
  languageVariants?: string[]
  studyGuideAssetId?: string
  status: CourseStatus
  tags: string[]
  fieldReadinessScore: number
  modules: CourseModuleDTO[]
  certificateExpiresInDays?: number
  updatedAt: string
}

export type QuizQuestionDTO = {
  id: string
  prompt: string
  options: string[]
  answer: string
  coaching: string
}

export type EnrollmentDTO = {
  id: string
  tenantId: string
  userId: string
  courseId: string
  status: EnrollmentStatus
  dueAt?: string
  completedAt?: string
  progress: number
}

export type CompletionDTO = {
  id: string
  tenantId: string
  userId: string
  courseId: string
  lessonId?: string
  completedAt: string
  source: string
}

export type CompletionResultDTO = {
  completion: CompletionDTO
  enrollment?: EnrollmentDTO
  certificate?: CertificateDTO | null
}

export type CertificateDTO = {
  id: string
  tenantId: string
  userId: string
  courseId: string
  certificateNumber: string
  issuedAt: string
  expiresAt?: string
  revokedAt?: string
}

export type AdminReportDTO = {
  summary: {
    users: number
    courses: number
    enrollments: number
    completed: number
    overdue: number
    completionRate: number
    xapiStatements: number
    completions: number
    certificates: number
  }
  enrollments: EnrollmentDTO[]
  completions: CompletionDTO[]
}

export type ProductPackageDTO = {
  id: string
  name: string
  slug: string
  description: string
  status: CommerceStatus
  bundleIds: string[]
  seatLimit: number
  featureFlags: Record<string, boolean>
  stripeProductId?: string
  stripePriceId?: string
  priceLabel?: string
  headline?: string
  bestFor?: string
  featured?: boolean
  ctaLabel?: string
  trialLabel?: string
  seatLabel?: string
  displayPriceLabel?: string
  buyerType: 'individual' | 'company' | 'both'
  sortOrder: number
}

export type PublicCourseDTO = {
  id: string
  slug: string
  title: string
  description: string
  publicSummary: string
  audience: string[]
  outcomes: string[]
  category: string
  role: string
  topic: string
  durationMinutes: number
  certificateLabel: string
  complianceDisclaimers?: string[]
  contactHourTargetMinutes?: number
  sequenceLocked?: boolean
  passingScore?: number
  attemptLimit?: number
  languageVariants?: string[]
  topicOutline?: Array<{
    title: string
    description?: string
    moduleTopicCode?: string
    contactHourTargetMinutes?: number
  }>
  fieldReadinessScore: number
  thumbnailUrl?: string
  heroImageUrl?: string
  previewLesson?: {
    title: string
    description: string
    durationMinutes: number
    kind: LessonKind
  }
  includedPackageIds: string[]
  tags: string[]
}

export type CourseBundleDTO = {
  id: string
  name: string
  slug: string
  description: string
  category: string
  status: CommerceStatus
  courseIds: string[]
  sortOrder: number
}

export type SubscriptionDTO = {
  id: string
  tenantId: string
  buyerUserId: string
  packageId: string
  status: SubscriptionStatus
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd: boolean
}

export type EntitlementDTO = {
  id: string
  tenantId: string
  packageId: string
  courseIds: string[]
  seatLimit: number
  features: Record<string, boolean>
  source: 'stripe' | 'manual' | 'trial' | 'demo'
}

export type MarketplaceOrderDTO = {
  id: string
  tenantId?: string
  packageId: string
  buyerEmail: string
  buyerName: string
  buyerType: 'individual' | 'company'
  companyName?: string
  seatCount: number
  courseSlug?: string
  status: MarketplaceOrderStatus
  stripeCheckoutSessionId?: string
}

export type CatalogDTO = {
  packages: ProductPackageDTO[]
  bundles: CourseBundleDTO[]
  courses: PublicCourseDTO[]
}

export type CatalogLandingDTO = {
  packages: ProductPackageDTO[]
  courses: PublicCourseDTO[]
  stats: {
    packages: number
    courses: number
    categories: number
    certificateCourses: number
  }
  categories: string[]
}

export type CheckoutSessionInput = {
  packageSlug: string
  buyerType: 'individual' | 'company'
  buyerName: string
  buyerEmail: string
  companyName?: string
  seatCount?: number
  successUrl?: string
  cancelUrl?: string
  courseSlug?: string
}

export type CheckoutSessionDTO = {
  checkoutUrl: string
  mode: 'stripe' | 'configuration-required'
  order: MarketplaceOrderDTO
}

export type LeadCaptureInput = {
  name: string
  email: string
  company?: string
  teamSize?: string
  interest?: string
  message?: string
  sourcePath?: string
}

export type LeadCaptureDTO = LeadCaptureInput & {
  id: string
  status: 'new' | 'reviewed' | 'converted' | 'archived'
  createdAt: string
}

export type AnalyticsEventInput = {
  eventName: string
  sourcePath?: string
  courseSlug?: string
  packageSlug?: string
  metadata?: Record<string, unknown>
}

export type AnalyticsEventDTO = AnalyticsEventInput & {
  id: string
  createdAt: string
}

export type CreateUserInput = {
  email: string
  name: string
  password?: string
  roles?: UserRole[]
  jobTitle?: string
  department?: string
  crew?: string
  site?: string
}

export type ImportUsersInput = {
  users: CreateUserInput[]
}

export type AssignCourseInput = {
  userIds: string[]
  courseId: string
  dueAt?: string
}

export type OfflineSyncItem = {
  idempotencyKey: string
  tenantId: string
  userId: string
  type: 'xapi-statement' | 'attempt' | 'completion' | 'scorm-runtime'
  payload: unknown
  createdAt: string
}

export type SyncRequest = {
  deviceId: string
  items: OfflineSyncItem[]
}

export type SyncResponse = {
  accepted: string[]
  rejected: Array<{ idempotencyKey: string; reason: string }>
}

export type ScormRuntimeVersion = '1.2' | '2004'

export type ScormRuntimeDTO = {
  id: string
  tenantId: string
  attemptId: string
  packageId: string
  version: ScormRuntimeVersion
  lessonStatus?: string
  completionStatus?: string
  successStatus?: string
  scoreRaw?: number
  scoreMin?: number
  scoreMax?: number
  suspendData?: string
  location?: string
  sessionTime?: string
  totalTime?: string
  interactions: Array<Record<string, unknown>>
  updatedAt: string
}

export type ScormRuntimeState = {
  tenantId: string
  attemptId: string
  packageId: string
  version: ScormRuntimeVersion
  lessonStatus?: string
  completionStatus?: string
  successStatus?: string
  scoreRaw?: number
  scoreMin?: number
  scoreMax?: number
  suspendData?: string
  location?: string
  sessionTime?: string
  totalTime?: string
  interactions?: Array<Record<string, unknown>>
}

// ===========================================================================
// AWS-era single-table records
// ---------------------------------------------------------------------------
// These model persisted entities. Every record is owned by exactly one tenant
// via `tenantId` (PK = TENANT#<tenantId>). Resolvers derive the target tenant
// from the record's key and enforce isolation via assertTenantMatch (tenant.ts).
// ===========================================================================

/** Marker mixin: every stored entity is owned by exactly one tenant partition. */
export type TenantScoped = {
  /** The owning tenant. Corresponds to PK = TENANT#<tenantId>. */
  tenantId: string
}

/** Persisted tenant metadata item (SK = TENANT#META). */
export type TenantRecord = TenantScoped & {
  id: string
  name: string
  slug: string
  domains: string[]
  status: TenantStatus
  mode: TenantMode
  billingStatus: BillingStatus
  seatLimit?: number
  branding: TenantBranding
  settings: TenantSettings
  createdAt: string
  updatedAt: string
}

/** Persisted user (SK = USER#<userId>). Roles mirror Cognito groups (see roles.ts). */
export type UserRecord = TenantScoped & {
  id: string
  email: string
  name: string
  roles: UserRole[]
  jobTitle?: string
  department?: string
  crew?: string
  site?: string
  status: 'active' | 'invited' | 'disabled'
  createdAt: string
  updatedAt: string
}

/** Persisted course header (SK = COURSE#<courseId>). Modules/lessons are child items. */
export type CourseRecord = TenantScoped & {
  id: string
  slug?: string
  title: string
  description: string
  status: CourseStatus
  tags: string[]
  category?: string
  durationMinutes?: number
  passingScore?: number
  attemptLimit?: number
  sequenceLocked?: boolean
  certificateLabel?: string
  certificateExpiresInDays?: number
  fieldReadinessScore: number
  createdAt: string
  updatedAt: string
}

/** Persisted module (SK = MODULE#<courseId>#<moduleId>). */
export type ModuleRecord = TenantScoped & {
  id: string
  courseId: string
  title: string
  description?: string
  moduleTopicCode?: string
  sequence: number
  contactHourTargetMinutes?: number
  minimumSeatTimeMinutes?: number
  sequenceLocked?: boolean
  createdAt: string
  updatedAt: string
}

/** Persisted lesson (SK = LESSON#<courseId>#<moduleId>#<lessonId>). */
export type LessonRecord = TenantScoped & {
  id: string
  courseId: string
  moduleId: string
  kind: LessonKind
  title: string
  description: string
  sequence: number
  durationMinutes: number
  required: boolean
  minimumSeatTimeMinutes?: number
  passingScore?: number
  attemptLimit?: number
  /** For video lessons, the VideoAsset this lesson plays (metadata item id). */
  videoId?: string
  studyGuideAssetId?: string
  languageVariants?: string[]
  createdAt: string
  updatedAt: string
}

/** Persisted enrollment (SK = ENROLLMENT#<userId>#<courseId>). */
export type EnrollmentRecord = TenantScoped & {
  id: string
  userId: string
  courseId: string
  status: EnrollmentStatus
  progress: number
  assignedAt: string
  dueAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * Persisted VideoAsset METADATA (SK = VIDEO#<videoId>).
 *
 * This item NEVER holds video bytes. The media itself lives in object storage
 * (S3) / a streaming provider; this record only describes it: identifiers,
 * playback references, duration, captions, and privacy posture. Playback URLs
 * are resolved on demand behind tenant-scoped authorization.
 */
export type VideoAssetRecord = TenantScoped & {
  id: string
  title: string
  /** Storage locator for the source object — NOT the bytes. e.g. an S3 key. */
  storageKey?: string
  /** External streaming provider handle (e.g. Vimeo/HLS id), when applicable. */
  providerVideoId?: string
  provider?: 'vimeo' | 'mux' | 's3-hls' | 'other'
  durationSeconds?: number
  captionsAssetKey?: string
  posterKey?: string
  /** Whether domain-privacy / signed playback is required for this asset. */
  privacyRequired: boolean
  status: 'processing' | 'ready' | 'errored'
  createdAt: string
  updatedAt: string
}

// ===========================================================================
// Carried-forward helpers (identical behavior — console depends on these)
// ===========================================================================

export function normalizeTenantSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveTenantSlugFromHost(hostHeader: string | undefined, rootDomain?: string): string {
  const host = (hostHeader ?? '').split(':')[0].toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'demo'
  if (rootDomain && host.endsWith(`.${rootDomain}`)) return host.replace(`.${rootDomain}`, '')
  return host.split('.')[0] || 'demo'
}

/**
 * Legacy role check over the `UserRole` vocabulary. Preserved verbatim for the
 * console. For Cognito-group authorization at the edge use `hasRequiredGroup`
 * (roles.ts); the two vocabularies map 1:1 (see GROUP_TO_USER_ROLE).
 */
export function hasRequiredRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
  if (userRoles.includes('superadmin')) return true
  return requiredRoles.some((role) => userRoles.includes(role))
}

export function isUserRole(value: string): value is UserRole {
  return ['learner', 'manager', 'admin', 'superadmin'].includes(value)
}

export function normalizeRoles(values: unknown, fallback: UserRole[] = ['learner']): UserRole[] {
  if (!Array.isArray(values)) return fallback
  const roles = values.map(String).filter(isUserRole)
  return roles.length ? Array.from(new Set(roles)) : fallback
}

export function requireStringField(payload: Record<string, unknown>, field: string): string {
  const value = String(payload[field] ?? '').trim()
  if (!value) {
    throw new Error(`${field} is required`)
  }
  return value
}

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isCourseCompleteFromRequiredLessons(
  requiredLessonIds: string[],
  completedLessonIds: string[],
): boolean {
  if (!requiredLessonIds.length) return false
  const completed = new Set(completedLessonIds)
  return requiredLessonIds.every((lessonId) => completed.has(lessonId))
}

export function calculateCourseProgress(requiredLessonIds: string[], completedLessonIds: string[]): number {
  if (!requiredLessonIds.length) return 0
  const completed = new Set(completedLessonIds)
  const completedRequiredLessons = requiredLessonIds.filter((lessonId) => completed.has(lessonId)).length
  return Math.min(100, Math.round((completedRequiredLessons / requiredLessonIds.length) * 100))
}

export function normalizeScormNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

export function isScormCompletionStatus(value: unknown): boolean {
  return ['completed', 'passed'].includes(String(value ?? '').toLowerCase())
}
