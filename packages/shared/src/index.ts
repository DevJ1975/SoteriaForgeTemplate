export type TenantStatus = 'active' | 'trial' | 'suspended' | 'archived'
export type UserRole = 'learner' | 'manager' | 'admin' | 'superadmin'
export type CourseStatus = 'draft' | 'published' | 'archived'
export type LessonKind = 'video' | 'quiz' | 'game' | 'scorm' | 'document' | 'reflection' | 'practical-signoff'
export type EnrollmentStatus = 'assigned' | 'in-progress' | 'completed' | 'overdue' | 'expired'
export type AttemptStatus = 'started' | 'completed' | 'failed' | 'synced' | 'queued'
export type AssetKind = 'vimeo-video' | 'scorm-package' | 'document' | 'thumbnail' | 'offline-bundle'

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
  vimeoUrl?: string
  assetId?: string
  quizQuestions?: QuizQuestionDTO[]
  transcript?: string
  offlineSummary?: string
}

export type CourseModuleDTO = {
  id: string
  title: string
  description?: string
  lessons: CourseLessonDTO[]
}

export type CourseDTO = {
  id: string
  tenantId: string
  title: string
  description: string
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

export type XapiStatement = {
  id: string
  tenantId: string
  actor: {
    account?: {
      homePage: string
      name: string
    }
    mbox?: string
    name: string
  }
  verb: {
    id: string
    display: Record<string, string>
  }
  object: {
    id: string
    definition?: {
      name?: Record<string, string>
      description?: Record<string, string>
      type?: string
    }
  }
  result?: {
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
  }
  context?: Record<string, unknown>
  timestamp: string
  stored?: string
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
} as const

export function normalizeTenantSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveTenantSlugFromHost(hostHeader: string | undefined, rootDomain?: string) {
  const host = (hostHeader ?? '').split(':')[0].toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'demo'
  if (rootDomain && host.endsWith(`.${rootDomain}`)) return host.replace(`.${rootDomain}`, '')
  return host.split('.')[0] || 'demo'
}

export function hasRequiredRole(userRoles: UserRole[], requiredRoles: UserRole[]) {
  if (userRoles.includes('superadmin')) return true
  return requiredRoles.some((role) => userRoles.includes(role))
}

export function createXapiStatement(input: Omit<XapiStatement, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) {
  return {
    ...input,
    id: input.id ?? cryptoSafeId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  }
}

function cryptoSafeId() {
  return `stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
