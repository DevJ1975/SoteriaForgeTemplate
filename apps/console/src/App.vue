<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { AlertTriangle, BarChart3, BookOpenCheck, Building2, CheckCircle2, ClipboardList, Clock, CopyPlus, Download, FileStack, FolderPlus, GraduationCap, KeyRound, LibraryBig, ListChecks, Loader, MailPlus, Plus, RadioTower, RefreshCw, Rocket, ShieldCheck, TrendingUp, Trash2, UserPlus, Users, WandSparkles } from '@lucide/vue'
import { normalizeTenantSlug, type CourseDTO, type LessonKind, type ProductPackageDTO, type TenantDTO, type UserDTO, type UserRole } from '@soteria-forge/shared'
import forgeLogo from './assets/brand/logos/soteria-forge-horizontal.svg'
import {
  consoleApi,
  INVITABLE_ROLES,
  type CompletionReport,
  type CourseEnrollment,
  type CreateCourseInput,
  type InvitableRole,
  type TenantMember,
} from './services/api'
import type { CourseRow, InvitationRow, LessonRow, ModuleRow } from '@soteria-forge/shared/supabase'

const tenantName = ref('Acme Industrial Services')
const tenantSlug = computed(() => normalizeTenantSlug(tenantName.value))
const courseTitle = ref('Confined Space Entry Refresher')
const sopSource = ref('Paste an SOP, toolbox talk, or safety bulletin here to draft modules, quiz checks, and sign-off steps.')
const email = ref('superadmin@soteriaforge.local')
const password = ref('SoteriaForgeDemo!2026')
const tenantLoginSlug = ref('demo')
const status = ref('Sign in to manage tenants and course drafts.')
const isLoggedIn = ref(false)
const tenants = ref<TenantDTO[]>([])
const packages = ref<ProductPackageDTO[]>([])
const selectedTenantSlug = ref('demo')
const selectedTenantId = computed(() => tenants.value.find((tenant) => tenant.slug === selectedTenantSlug.value)?.id ?? '')
const dedicatedSubdomain = ref('')
const savedCourse = ref<CourseDTO | null>(null)

// ── Invitations ──────────────────────────────────────────────────────────────
// The signed-in user's own role (from their session profile) gates who sees the
// invite panel. RLS is the real gate server-side; this is a UI affordance only.
const currentUser = ref<UserDTO | null>(null)
// Legacy UserRole vocabulary: 'admin' === tenant-admin, 'superadmin' === super-admin.
const ADMIN_ROLES: readonly UserRole[] = ['admin', 'superadmin']
const canInvite = computed(() =>
  (currentUser.value?.roles ?? []).some((role) => ADMIN_ROLES.includes(role)),
)

// Provisioning a brand-new tenant is a SUPER-ADMIN-ONLY action (the one
// legitimately cross-tenant operation). Unlike `canInvite`, this deliberately
// requires the legacy `superadmin` role specifically — a plain tenant-admin
// ('admin') must NOT see or reach it. RLS/the RPC is the real gate server-side;
// this computed only decides whether the affordance is shown.
const canProvisionTenant = computed(() =>
  (currentUser.value?.roles ?? []).includes('superadmin'),
)

// Authoring content (courses/modules/lessons) and enrolling workers is a
// tenant-admin action. Like `canInvite`, both the legacy `admin` (tenant-admin)
// and `superadmin` (super-admin) roles qualify — reuse the same ADMIN_ROLES
// bridge rather than hardcoding a role string. RLS is the real gate server-side
// (only tenant-admin/super-admin may write courses/modules/lessons/enrollments,
// SQLSTATE 42501 for anyone else); this computed only decides whether the
// affordance is shown.
const canManageContent = computed(() =>
  (currentUser.value?.roles ?? []).some((role) => ADMIN_ROLES.includes(role)),
)

// ── View switching ────────────────────────────────────────────────────────────
// The console is a single shell; nav items switch which workspace view renders.
// 'dashboard' is the original all-panels screen (unchanged); 'courses' and
// 'roster' are the content-authoring + enrollment views (admin-gated);
// 'reports' is the read-only completion/compliance dashboard (admin-gated).
type ConsoleView = 'dashboard' | 'courses' | 'roster' | 'reports'
const activeView = ref<ConsoleView>('dashboard')

function goTo(view: ConsoleView) {
  activeView.value = view
  // Lazily hydrate the authoring/roster data the first time an admin opens one
  // of the new views. Declared below; forward-referenced here (both are in scope
  // by the time this runs).
  if (view === 'courses' || view === 'roster') void ensureContentLoaded()
  // The Reports view loads its own RLS-scoped rollup on first open.
  if (view === 'reports') void ensureReportLoaded()
}

// Friendly labels for the stored group-vocabulary invite roles.
const INVITE_ROLE_LABELS: Record<InvitableRole, string> = {
  worker: 'Worker (learner)',
  supervisor: 'Supervisor (manager)',
  'tenant-admin': 'Tenant admin',
}
const inviteRoleOptions = INVITABLE_ROLES.map((role) => ({ value: role, label: INVITE_ROLE_LABELS[role] }))

const inviteEmail = ref('')
const inviteRole = ref<InvitableRole>('worker')
const inviteError = ref('')
const invitations = ref<InvitationRow[]>([])

// ── Provision Tenant (super-admin only) ───────────────────────────────────────
// Stand up a new tenant + its first-admin invite via the `provision_tenant` RPC.
type ProvisionMode = 'dedicated' | 'marketplace'
const PROVISION_MODE_OPTIONS: readonly { value: ProvisionMode; label: string }[] = [
  { value: 'dedicated', label: 'Dedicated' },
  { value: 'marketplace', label: 'Marketplace' },
]
const provisionName = ref('')
// Auto-suggest a URL-safe slug from the name (a nice touch; still editable). We
// only override the slug while the operator has not hand-edited it.
const provisionSlugTouched = ref(false)
const provisionSlug = ref('')
const suggestedProvisionSlug = computed(() => normalizeTenantSlug(provisionName.value))
const provisionAdminEmail = ref('')
const provisionMode = ref<ProvisionMode>('dedicated')
const provisionError = ref('')
const provisionResult = ref<{ tenant_id: string; tenant_slug: string; invite_token: string } | null>(null)

function onProvisionNameInput() {
  // Keep the slug in step with the name until the operator edits the slug field.
  if (!provisionSlugTouched.value) provisionSlug.value = suggestedProvisionSlug.value
}

function onProvisionSlugInput() {
  provisionSlugTouched.value = true
}

const packageDraft = ref({
  name: 'Starter',
  slug: 'starter',
  description: 'Monthly access for solo learners and small teams.',
  seatLimit: 3,
  stripePriceId: '',
  priceLabel: 'Configure Stripe price',
})

const tenantPreview = computed<TenantDTO>(() => ({
  id: 'preview',
  name: tenantName.value,
    slug: tenantSlug.value,
    domains: [`${tenantSlug.value}.soteriaforge.com`],
    status: 'trial',
    mode: 'dedicated',
    billingStatus: 'manual',
    branding: {
    appName: tenantName.value,
    primaryColor: '#3DA9FC',
    accentColor: '#FF6B1F',
  },
  settings: {
    offlineEnabled: true,
    lowBandwidthMode: true,
    vimeoDomainPrivacyRequired: true,
    defaultCertificateExpiryDays: 365,
  },
}))

const coursePreview = computed<CourseDTO>(() => ({
  id: 'draft-preview',
  tenantId: tenantPreview.value.id,
  title: courseTitle.value,
  description: 'AI-assisted draft prepared for mobile, offline, field-ready delivery.',
  status: 'draft',
  tags: ['field-ready', 'supervisor-signoff', 'microlearning'],
  fieldReadinessScore: sopSource.value.length > 80 ? 91 : 74,
  certificateExpiresInDays: 365,
  updatedAt: new Date().toISOString(),
  modules: [
    {
      id: 'module-1',
      title: 'Before Entry',
      description: 'Hazard recognition, permits, atmosphere checks, and stop-work triggers.',
      lessons: [
        {
          id: 'lesson-1',
          kind: 'video',
          title: 'Permit and Atmosphere Check',
          description: 'Vimeo-backed micro lesson with transcript and low-bandwidth summary.',
          durationMinutes: 6,
          required: true,
          offlineSummary: 'Offline summary generated from source SOP.',
        },
        {
          id: 'lesson-2',
          kind: 'quiz',
          title: 'Entry Readiness Knowledge Check',
          description: 'Scenario questions generated from the source material.',
          durationMinutes: 4,
          required: true,
        },
        {
          id: 'lesson-3',
          kind: 'practical-signoff',
          title: 'Supervisor Observation',
          description: 'Supervisor verifies the learner can perform the checklist in the field.',
          durationMinutes: 5,
          required: true,
        },
      ],
    },
  ],
}))

async function login() {
  status.value = 'Signing in'
  const session = await consoleApi.login(email.value, password.value, tenantLoginSlug.value)
  currentUser.value = session.user
  isLoggedIn.value = true
  status.value = `Signed in as ${session.user.email}`
  await loadTenants()
  await loadInvitations()
}

async function loadTenants() {
  const [response, packageResponse] = await Promise.all([consoleApi.tenants(), consoleApi.catalogPackages()])
  tenants.value = response.tenants
  packages.value = packageResponse.packages
  selectedTenantSlug.value = tenants.value[0]?.slug ?? 'demo'
}

async function loadInvitations() {
  // Only admins can list invitations under RLS; skip the call for others so a
  // learner/manager session doesn't surface a benign RLS-empty result as noise.
  if (!canInvite.value) {
    invitations.value = []
    return
  }
  try {
    const response = await consoleApi.listInvitations()
    invitations.value = response.invitations
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Unable to load invitations'
  }
}

async function sendInvite() {
  inviteError.value = ''
  const address = inviteEmail.value.trim()
  if (!address) {
    inviteError.value = 'Enter an email address to invite.'
    return
  }
  status.value = `Inviting ${address}`
  try {
    const { invite } = await consoleApi.inviteUser(address, inviteRole.value)
    // Prepend the new invite (RLS already scoped it to our tenant).
    invitations.value = [invite, ...invitations.value.filter((row) => row.id !== invite.id)]
    inviteEmail.value = ''
    status.value = `Invited ${invite.email} as ${inviteRole.value}`
  } catch (error) {
    // Surface RLS rejection (non-admin) and any other failure gracefully.
    inviteError.value = error instanceof Error ? error.message : 'Unable to send invitation'
    status.value = 'Invitation failed'
  }
}

async function copyInviteToken(token: string) {
  try {
    await navigator.clipboard?.writeText(token)
    status.value = 'Invite token copied to clipboard'
  } catch {
    // Clipboard may be unavailable (insecure context); the token stays visible.
    status.value = 'Copy unavailable — select the token to copy it manually'
  }
}

async function submitProvisionTenant() {
  provisionError.value = ''
  const name = provisionName.value.trim()
  const slug = provisionSlug.value.trim()
  const adminEmail = provisionAdminEmail.value.trim()
  if (!name || !slug || !adminEmail) {
    provisionError.value = 'Enter a tenant name, slug, and first-admin email.'
    return
  }
  status.value = `Provisioning ${name}`
  try {
    const result = await consoleApi.provisionTenant(name, slug, adminEmail, provisionMode.value)
    provisionResult.value = result
    status.value = `Provisioned ${result.tenant_slug}`
    // Reflect the new tenant in the list a super-admin sees (RLS returns all).
    await loadTenants()
    selectedTenantSlug.value = result.tenant_slug
  } catch (error) {
    // Surface RLS/role rejection (non-super-admin) or a taken slug as the server
    // message instead of crashing the console.
    provisionError.value = error instanceof Error ? error.message : 'Unable to provision tenant'
    status.value = 'Provisioning failed'
  }
}

async function provisionTenant() {
  status.value = 'Provisioning tenant'
  const response = await consoleApi.createTenant({
    name: tenantPreview.value.name,
    slug: tenantPreview.value.slug,
    domains: tenantPreview.value.domains,
    status: tenantPreview.value.status,
    branding: tenantPreview.value.branding,
    settings: tenantPreview.value.settings,
  })
  selectedTenantSlug.value = response.tenant.slug
  status.value = `Provisioned ${response.tenant.name}`
  await loadTenants()
}

async function saveDraftCourse() {
  status.value = 'Saving course draft'
  // No tenant slug is sent: RLS stamps the course to the signed-in caller's own
  // tenant from the session JWT. The selector below is a display affordance only.
  const response = await consoleApi.createCourse(coursePreview.value)
  savedCourse.value = response.course
  status.value = `Saved draft: ${response.course.title}`
}

async function publishDraftCourse() {
  if (!savedCourse.value) return
  status.value = 'Publishing course'
  const response = await consoleApi.publishCourse(savedCourse.value.id)
  savedCourse.value = response.course
  status.value = `Published: ${response.course.title}`
}

async function savePackage() {
  status.value = 'Saving marketplace package'
  const response = await consoleApi.createPackage({
    ...packageDraft.value,
    status: 'active',
    buyerType: 'both',
    featureFlags: {
      certificates: true,
      offlineMode: true,
      managerReports: packageDraft.value.seatLimit > 3,
    },
  })
  status.value = `Saved package: ${response.package.name}`
  packages.value = [response.package, ...packages.value]
}

async function convertSelectedTenant() {
  if (!selectedTenantId.value) return
  status.value = 'Converting tenant to dedicated mode'
  const response = await consoleApi.convertTenantToDedicated(selectedTenantId.value, {
    subdomain: dedicatedSubdomain.value || selectedTenantSlug.value,
    billingStatus: 'manual',
  })
  status.value = `Converted ${response.tenant.name} to dedicated tenant mode`
  await loadTenants()
}

// ── Content authoring (Courses view) ──────────────────────────────────────────
// A tenant-admin authors courses → modules → lessons. All writes are RLS-gated
// server-side; no tenant is ever sent from the UI for authorization.
const COURSE_STATUS_OPTIONS: readonly { value: CourseDTO['status']; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]
const LESSON_KIND_OPTIONS: readonly { value: LessonKind; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'document', label: 'Document' },
  { value: 'reflection', label: 'Reflection' },
  { value: 'practical-signoff', label: 'Practical sign-off' },
]

const courseList = ref<CourseRow[]>([])
const contentError = ref('')

// New-course form.
const newCourse = ref<CreateCourseInput & { tagsText: string }>({
  title: '',
  description: '',
  category: '',
  status: 'draft',
  durationMinutes: undefined,
  tags: [],
  tagsText: '',
})

// The currently-open course editor (its tree), or null when just listing.
const selectedCourse = ref<CourseRow | null>(null)
const editorModules = ref<ModuleRow[]>([])
const editorLessons = ref<LessonRow[]>([])

// Add-module form (title only; sequence auto-derives from the current count).
const newModuleTitle = ref('')
// Add-lesson forms, keyed by module id so each module has its own draft row.
type LessonDraft = {
  kind: LessonKind
  title: string
  durationMinutes: number
  required: boolean
  passingScore: number | null
}
// One add-lesson draft per module id, kept in a reactive map so each module's
// inline "add lesson" row binds independently. Drafts are SEEDED explicitly when
// modules load/add (below), so the template only ever reads them — never mutates
// state during render.
const lessonDrafts = reactive<Record<string, LessonDraft>>({})

function newLessonDraft(): LessonDraft {
  return { kind: 'video', title: '', durationMinutes: 5, required: true, passingScore: null }
}

/** Ensure a draft exists for a module id (call outside render, e.g. on load). */
function seedLessonDraft(moduleId: string) {
  if (!lessonDrafts[moduleId]) lessonDrafts[moduleId] = newLessonDraft()
}

/** Read a module's draft. Callers seed it first; falls back defensively. */
function lessonDraftFor(moduleId: string): LessonDraft {
  return lessonDrafts[moduleId] ?? newLessonDraft()
}

function lessonsForModule(moduleId: string): LessonRow[] {
  return editorLessons.value
    .filter((lesson) => lesson.module_id === moduleId)
    .sort((a, b) => a.sequence - b.sequence)
}

async function loadCourses() {
  if (!canManageContent.value) {
    courseList.value = []
    return
  }
  contentError.value = ''
  try {
    const { courses } = await consoleApi.listCourses()
    courseList.value = courses
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to load courses'
  }
}

async function createCourse() {
  contentError.value = ''
  const title = newCourse.value.title.trim()
  if (!title) {
    contentError.value = 'Enter a course title.'
    return
  }
  const tags = newCourse.value.tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  status.value = `Creating course ${title}`
  try {
    const { course } = await consoleApi.createCourseHeader({
      title,
      description: newCourse.value.description?.trim() || undefined,
      category: newCourse.value.category?.trim() || undefined,
      status: newCourse.value.status,
      durationMinutes: newCourse.value.durationMinutes,
      tags,
    })
    courseList.value = [course, ...courseList.value]
    newCourse.value = { title: '', description: '', category: '', status: 'draft', durationMinutes: undefined, tags: [], tagsText: '' }
    status.value = `Created course ${course.title}`
    await openCourse(course)
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to create course'
    status.value = 'Course creation failed'
  }
}

async function openCourse(course: CourseRow) {
  contentError.value = ''
  selectedCourse.value = course
  newModuleTitle.value = ''
  // Reset all add-lesson drafts from any previously-open course.
  for (const key of Object.keys(lessonDrafts)) delete lessonDrafts[key]
  try {
    const tree = await consoleApi.getCourseTree(course.id)
    selectedCourse.value = tree.course
    editorModules.value = tree.modules
    editorLessons.value = tree.lessons
    // Seed one draft per module so the template only reads them (no mutate-on-render).
    for (const module of tree.modules) seedLessonDraft(module.id)
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to open course'
  }
}

function closeCourse() {
  selectedCourse.value = null
  editorModules.value = []
  editorLessons.value = []
  for (const key of Object.keys(lessonDrafts)) delete lessonDrafts[key]
}

async function addModule() {
  if (!selectedCourse.value) return
  const title = newModuleTitle.value.trim()
  if (!title) {
    contentError.value = 'Enter a module title.'
    return
  }
  contentError.value = ''
  try {
    // Next sequence = current module count (0-based, appended at the end).
    const { module } = await consoleApi.createModule(selectedCourse.value.id, {
      title,
      sequence: editorModules.value.length,
    })
    editorModules.value = [...editorModules.value, module]
    seedLessonDraft(module.id)
    newModuleTitle.value = ''
    status.value = `Added module ${module.title}`
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to add module'
  }
}

async function removeModule(module: ModuleRow) {
  contentError.value = ''
  try {
    await consoleApi.deleteModule(module.id)
    editorModules.value = editorModules.value.filter((row) => row.id !== module.id)
    // The DB cascades child lessons; drop them from local state to match.
    editorLessons.value = editorLessons.value.filter((lesson) => lesson.module_id !== module.id)
    delete lessonDrafts[module.id]
    status.value = `Removed module ${module.title}`
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to remove module'
  }
}

async function addLesson(module: ModuleRow) {
  if (!selectedCourse.value) return
  const draft = lessonDraftFor(module.id)
  const title = draft.title.trim()
  if (!title) {
    contentError.value = 'Enter a lesson title.'
    return
  }
  contentError.value = ''
  try {
    const { lesson } = await consoleApi.createLesson({
      courseId: selectedCourse.value.id,
      moduleId: module.id,
      kind: draft.kind,
      title,
      durationMinutes: Number(draft.durationMinutes) || 0,
      required: draft.required,
      sequence: lessonsForModule(module.id).length,
      passingScore: draft.passingScore ?? undefined,
    })
    editorLessons.value = [...editorLessons.value, lesson]
    // Reset this module's draft in place (keeps the reactive binding stable).
    lessonDrafts[module.id] = newLessonDraft()
    status.value = `Added lesson ${lesson.title}`
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to add lesson'
  }
}

async function removeLesson(lesson: LessonRow) {
  contentError.value = ''
  try {
    await consoleApi.deleteLesson(lesson.id)
    editorLessons.value = editorLessons.value.filter((row) => row.id !== lesson.id)
    status.value = `Removed lesson ${lesson.title}`
  } catch (error) {
    contentError.value = error instanceof Error ? error.message : 'Unable to remove lesson'
  }
}

// ── Roster & enrollment view ───────────────────────────────────────────────────
const members = ref<TenantMember[]>([])
const rosterError = ref('')
const rosterCourseId = ref('')
const selectedMemberIds = ref<string[]>([])
const courseEnrollments = ref<CourseEnrollment[]>([])

const selectedRosterCourse = computed(() =>
  courseList.value.find((course) => course.id === rosterCourseId.value) ?? null,
)

function toggleMember(userId: string) {
  selectedMemberIds.value = selectedMemberIds.value.includes(userId)
    ? selectedMemberIds.value.filter((id) => id !== userId)
    : [...selectedMemberIds.value, userId]
}

async function loadRoster() {
  if (!canManageContent.value) {
    members.value = []
    return
  }
  rosterError.value = ''
  try {
    const { members: roster } = await consoleApi.listMembers()
    members.value = roster
  } catch (error) {
    rosterError.value = error instanceof Error ? error.message : 'Unable to load members'
  }
}

async function loadCourseEnrollments() {
  if (!rosterCourseId.value) {
    courseEnrollments.value = []
    return
  }
  rosterError.value = ''
  try {
    const { enrollments } = await consoleApi.listCourseEnrollments(rosterCourseId.value)
    courseEnrollments.value = enrollments
  } catch (error) {
    rosterError.value = error instanceof Error ? error.message : 'Unable to load enrollments'
  }
}

async function assignSelected() {
  rosterError.value = ''
  if (!rosterCourseId.value) {
    rosterError.value = 'Pick a course to assign.'
    return
  }
  if (!selectedMemberIds.value.length) {
    rosterError.value = 'Select at least one member to assign.'
    return
  }
  status.value = 'Assigning course'
  try {
    const { assigned } = await consoleApi.assignCourse(rosterCourseId.value, selectedMemberIds.value)
    status.value = `Assigned course to ${assigned} member(s)`
    selectedMemberIds.value = []
    await loadCourseEnrollments()
  } catch (error) {
    // Surface RLS rejection (non-admin) and any validation error inline.
    rosterError.value = error instanceof Error ? error.message : 'Unable to assign course'
    status.value = 'Assignment failed'
  }
}

// Load the content-authoring + roster data once, lazily, when an admin first
// opens either view (keeps a non-admin session from firing RLS-empty calls).
const contentLoaded = ref(false)
async function ensureContentLoaded() {
  if (contentLoaded.value || !canManageContent.value) return
  contentLoaded.value = true
  await Promise.all([loadCourses(), loadRoster()])
}

// ── Reports view (completion / compliance dashboard) ───────────────────────────
// READ-ONLY. A tenant-admin sees who has completed what. The report is computed
// server-side from RLS-scoped reads (own tenant only) — no tenant is ever sent
// from the UI for authorization; the view just renders the rollups.
const report = ref<CompletionReport | null>(null)
const reportError = ref('')
const reportLoading = ref(false)
const reportLoaded = ref(false)

async function loadReport() {
  if (!canManageContent.value) {
    report.value = null
    return
  }
  reportError.value = ''
  reportLoading.value = true
  try {
    const { report: result } = await consoleApi.getCompletionReport()
    report.value = result
  } catch (error) {
    // Surface RLS/permission or any load error inline instead of crashing.
    reportError.value = error instanceof Error ? error.message : 'Unable to load report'
  } finally {
    reportLoading.value = false
  }
}

/** Load the report the first time an admin opens the Reports view. */
async function ensureReportLoaded() {
  if (reportLoaded.value || !canManageContent.value) return
  reportLoaded.value = true
  await loadReport()
}

/** Manual refresh — re-reads the RLS-scoped rollup on demand. */
async function refreshReport() {
  status.value = 'Refreshing report'
  await loadReport()
  status.value = report.value ? 'Report refreshed' : status.value
}

/**
 * Relative-time label ("just now", "3h ago", "2d ago") for the completions
 * feed. Falls back to the raw value if it is not a parseable timestamp.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

/**
 * Export the by-worker table as a CSV download (nice-to-have). Builds an RFC
 * 4180-ish CSV in-memory and triggers a client download — no data leaves the
 * browser, and it only reflects the already-RLS-scoped rows the admin can see.
 */
function exportWorkerCsv() {
  if (!report.value?.byWorker.length) return
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = ['Worker', 'Email', 'Assigned', 'Completed', 'Avg progress %', 'Completion rate %']
  const rows = report.value.byWorker.map((row) => [
    row.name,
    row.email,
    row.assigned,
    row.completed,
    row.avgProgress,
    row.completionRatePct,
  ])
  const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'worker-completion-report.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  status.value = 'Exported by-worker report to CSV'
}

onMounted(async () => {
  // Restore any persisted Supabase session (auth.persistSession) instead of a
  // localStorage bearer token. RLS re-derives the tenant from the session.
  try {
    const session = await consoleApi.currentSession()
    if (session) {
      currentUser.value = session.user
      isLoggedIn.value = true
      status.value = `Signed in as ${session.user.email}`
      await loadTenants()
      await loadInvitations()
    }
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to restore session'
  }
})
</script>

<template>
  <main class="console-shell">
    <aside class="console-sidebar">
      <div class="brand-lockup">
        <img :src="forgeLogo" alt="Soteria FORGE" />
      </div>
      <nav>
        <button :class="{ 'nav-active': activeView === 'dashboard' }" type="button" @click="goTo('dashboard')"><Building2 :size="18" /> Tenants</button>
        <button type="button"><LibraryBig :size="18" /> Global Library</button>
        <button type="button"><ShieldCheck :size="18" /> Packages</button>
        <button type="button"><WandSparkles :size="18" /> Course Creator</button>
        <button v-if="canManageContent" :class="{ 'nav-active': activeView === 'courses' }" type="button" @click="goTo('courses')"><GraduationCap :size="18" /> Courses</button>
        <button v-if="canManageContent" :class="{ 'nav-active': activeView === 'roster' }" type="button" @click="goTo('roster')"><Users :size="18" /> Roster &amp; Enrollment</button>
        <button v-if="canManageContent" :class="{ 'nav-active': activeView === 'reports' }" type="button" @click="goTo('reports')"><BarChart3 :size="18" /> Reports</button>
        <button v-if="canProvisionTenant" type="button"><Rocket :size="18" /> Provision Tenant</button>
        <button v-if="canInvite" type="button"><UserPlus :size="18" /> Invite Users</button>
        <button type="button"><RadioTower :size="18" /> Sync Health</button>
      </nav>
    </aside>

    <section class="console-workspace">
      <header class="console-header">
        <div>
          <p>Superadmin console</p>
          <h1>Provision tenants and forge field-ready courses</h1>
          <span>{{ status }}</span>
        </div>
        <button class="primary-action" type="button" @click="saveDraftCourse" :disabled="!isLoggedIn">
          <CopyPlus :size="18" aria-hidden="true" />
          Save Draft
        </button>
      </header>

      <section v-if="!isLoggedIn" class="console-login panel">
        <h2>Superadmin sign in</h2>
        <label>
          Email
          <input v-model="email" type="email" />
        </label>
        <label>
          Password
          <input v-model="password" type="password" />
        </label>
        <label>
          Login tenant
          <input v-model="tenantLoginSlug" />
        </label>
        <button class="primary-action" type="button" @click="login">Sign In</button>
      </section>

      <template v-if="activeView === 'dashboard'">
      <section class="console-grid">
        <article class="panel">
          <h2>Tenant provisioning</h2>
          <label>
            Client name
            <input v-model="tenantName" />
          </label>
          <div class="preview-row">
            <span>Subdomain</span>
            <strong>{{ tenantPreview.domains[0] }}</strong>
          </div>
          <div class="preview-row">
            <span>Offline mode</span>
            <strong>Enabled</strong>
          </div>
          <button class="primary-action" type="button" :disabled="!isLoggedIn" @click="provisionTenant">
            <Building2 :size="18" aria-hidden="true" />
            Provision Tenant
          </button>
          <label>
            Draft target tenant
            <select v-model="selectedTenantSlug">
              <option value="demo">demo</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.slug">{{ tenant.name }}</option>
            </select>
          </label>
          <label>
            Dedicated subdomain
            <input v-model="dedicatedSubdomain" placeholder="client-subdomain" />
          </label>
          <button class="secondary-action" type="button" :disabled="!selectedTenantId" @click="convertSelectedTenant">
            Convert To Dedicated Tenant
          </button>
        </article>

        <article class="panel">
          <h2>Marketplace package</h2>
          <label>
            Package name
            <input v-model="packageDraft.name" />
          </label>
          <label>
            Stripe price ID
            <input v-model="packageDraft.stripePriceId" placeholder="price_..." />
          </label>
          <label>
            Seat limit
            <input v-model.number="packageDraft.seatLimit" min="1" type="number" />
          </label>
          <label>
            Package description
            <textarea v-model="packageDraft.description" rows="5"></textarea>
          </label>
          <button class="primary-action" type="button" :disabled="!isLoggedIn" @click="savePackage">
            Save Package
          </button>
        </article>

        <article class="panel">
          <h2>AI-assisted course draft</h2>
          <label>
            Course title
            <input v-model="courseTitle" />
          </label>
          <label>
            Source material
            <textarea v-model="sopSource" rows="8"></textarea>
          </label>
        </article>

        <article class="panel course-panel">
          <div class="readiness-score">
            <BookOpenCheck :size="26" aria-hidden="true" />
            <div>
              <span>Field readiness score</span>
              <strong>{{ coursePreview.fieldReadinessScore }}</strong>
            </div>
          </div>
          <h2>{{ coursePreview.title }}</h2>
          <p>{{ coursePreview.description }}</p>
          <div class="module-list">
            <div v-for="lesson in coursePreview.modules[0].lessons" :key="lesson.id">
              <FileStack :size="16" aria-hidden="true" />
              <span>{{ lesson.title }}</span>
              <small>{{ lesson.kind }}</small>
            </div>
          </div>
          <button class="primary-action" type="button" :disabled="!isLoggedIn" @click="saveDraftCourse">
            <WandSparkles :size="18" aria-hidden="true" />
            Save Draft To Tenant
          </button>
          <button class="secondary-action" type="button" :disabled="!savedCourse" @click="publishDraftCourse">
            Publish Saved Draft
          </button>
        </article>
      </section>

      <section class="tenant-list panel">
        <h2>Provisioned tenants</h2>
        <div class="module-list">
          <div v-for="tenant in tenants" :key="tenant.id">
            <Building2 :size="16" aria-hidden="true" />
            <span>{{ tenant.name }}</span>
            <small>{{ tenant.slug }}</small>
          </div>
        </div>
      </section>

      <section class="tenant-list panel">
        <h2>Marketplace packages</h2>
        <div class="module-list">
          <div v-for="productPackage in packages" :key="productPackage.id">
            <ShieldCheck :size="16" aria-hidden="true" />
            <span>{{ productPackage.name }}</span>
            <small>{{ productPackage.seatLimit }} seats · {{ productPackage.priceLabel }}</small>
          </div>
        </div>
      </section>

      <section v-if="isLoggedIn && canProvisionTenant" class="provision-panel panel">
        <h2>Provision a new tenant</h2>
        <p>
          Super-admin only. This stands up a brand-new tenant and its first-admin invitation in one
          server-side step. Share the returned token with the first admin: they sign up with the
          email below, then redeem the token to claim the tenant-admin account.
        </p>
        <div class="provision-form">
          <label>
            Tenant name
            <input
              v-model="provisionName"
              type="text"
              placeholder="Acme Industrial Services"
              autocomplete="off"
              @input="onProvisionNameInput"
            />
          </label>
          <label>
            Slug
            <input
              v-model="provisionSlug"
              type="text"
              placeholder="acme-industrial"
              autocomplete="off"
              @input="onProvisionSlugInput"
            />
          </label>
          <label>
            First-admin email
            <input
              v-model="provisionAdminEmail"
              type="email"
              placeholder="admin@acme.com"
              autocomplete="off"
            />
          </label>
          <label>
            Mode
            <select v-model="provisionMode">
              <option v-for="option in PROVISION_MODE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button class="primary-action" type="button" @click="submitProvisionTenant">
            <Rocket :size="18" aria-hidden="true" />
            Provision Tenant
          </button>
        </div>
        <p v-if="provisionError" class="provision-error" role="alert">{{ provisionError }}</p>

        <div v-if="provisionResult" class="provision-result">
          <h3 class="provision-subhead">Tenant provisioned</h3>
          <div class="provision-summary">
            <Building2 :size="16" aria-hidden="true" />
            <div class="provision-meta">
              <span>{{ provisionResult.tenant_slug }}</span>
              <small>{{ provisionResult.tenant_id }}</small>
            </div>
          </div>
          <p class="provision-hint">
            The first admin signs up with <strong>{{ provisionAdminEmail }}</strong>, then redeems
            this invite token to claim the tenant-admin account:
          </p>
          <button
            class="invite-token"
            type="button"
            :title="`Copy token: ${provisionResult.invite_token}`"
            @click="copyInviteToken(provisionResult.invite_token)"
          >
            <KeyRound :size="14" aria-hidden="true" />
            <code>{{ provisionResult.invite_token }}</code>
          </button>
        </div>
      </section>

      <section v-if="isLoggedIn && canInvite" class="invite-panel panel">
        <h2>Invite user to your tenant</h2>
        <p>
          The invitation is stamped to your tenant server-side (RLS). Share the returned token
          with the invitee to let them claim their account.
        </p>
        <div class="invite-form">
          <label>
            Email
            <input v-model="inviteEmail" type="email" placeholder="new.user@company.com" autocomplete="off" />
          </label>
          <label>
            Role
            <select v-model="inviteRole">
              <option v-for="option in inviteRoleOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button class="primary-action" type="button" @click="sendInvite">
            <MailPlus :size="18" aria-hidden="true" />
            Invite
          </button>
        </div>
        <p v-if="inviteError" class="invite-error" role="alert">{{ inviteError }}</p>

        <h3 class="invite-subhead">Pending invitations</h3>
        <p v-if="!invitations.length" class="invite-empty">No invitations yet.</p>
        <div v-else class="module-list">
          <div v-for="invite in invitations" :key="invite.id" class="invite-row">
            <UserPlus :size="16" aria-hidden="true" />
            <div class="invite-meta">
              <span>{{ invite.email }}</span>
              <small>{{ invite.role }} · {{ invite.status }}</small>
            </div>
            <button
              class="invite-token"
              type="button"
              :title="`Copy token: ${invite.token}`"
              @click="copyInviteToken(invite.token)"
            >
              <code>{{ invite.token }}</code>
            </button>
          </div>
        </div>
      </section>
      </template>

      <!-- ── Courses view (content authoring) ────────────────────────────── -->
      <template v-if="activeView === 'courses' && isLoggedIn && canManageContent">
        <section class="content-panel panel">
          <h2>New course</h2>
          <p>
            Author a course for your tenant. It is stamped to your tenant server-side (RLS); no
            tenant is chosen here. Add modules and lessons after it is created.
          </p>
          <div class="content-form">
            <label>
              Title
              <input v-model="newCourse.title" type="text" placeholder="Confined Space Entry Refresher" autocomplete="off" />
            </label>
            <label>
              Category
              <input v-model="newCourse.category" type="text" placeholder="Safety" autocomplete="off" />
            </label>
            <label>
              Status
              <select v-model="newCourse.status">
                <option v-for="option in COURSE_STATUS_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              Duration (minutes)
              <input v-model.number="newCourse.durationMinutes" type="number" min="0" placeholder="30" />
            </label>
            <label class="content-form-wide">
              Description
              <textarea v-model="newCourse.description" rows="2" placeholder="What this course covers"></textarea>
            </label>
            <label class="content-form-wide">
              Tags (comma-separated)
              <input v-model="newCourse.tagsText" type="text" placeholder="field-ready, supervisor-signoff" autocomplete="off" />
            </label>
            <button class="primary-action content-form-submit" type="button" @click="createCourse">
              <Plus :size="18" aria-hidden="true" />
              Create Course
            </button>
          </div>
          <p v-if="contentError" class="content-error" role="alert">{{ contentError }}</p>
        </section>

        <section class="tenant-list panel">
          <h2>Tenant courses</h2>
          <p v-if="!courseList.length" class="content-empty">No courses yet. Create one above.</p>
          <div v-else class="module-list">
            <button
              v-for="course in courseList"
              :key="course.id"
              class="content-row"
              type="button"
              :class="{ 'content-row-active': selectedCourse?.id === course.id }"
              @click="openCourse(course)"
            >
              <GraduationCap :size="16" aria-hidden="true" />
              <span>{{ course.title }}</span>
              <small>{{ course.status }}</small>
            </button>
          </div>
        </section>

        <section v-if="selectedCourse" class="content-editor panel">
          <div class="content-editor-head">
            <div>
              <h2>{{ selectedCourse.title }}</h2>
              <p class="content-hint">{{ selectedCourse.status }} · {{ editorModules.length }} module(s)</p>
            </div>
            <button class="secondary-action content-close" type="button" @click="closeCourse">Close</button>
          </div>

          <div class="content-add-module">
            <label>
              New module title
              <input v-model="newModuleTitle" type="text" placeholder="Before Entry" autocomplete="off" />
            </label>
            <button class="primary-action" type="button" @click="addModule">
              <FolderPlus :size="18" aria-hidden="true" />
              Add Module
            </button>
          </div>

          <p v-if="!editorModules.length" class="content-empty">No modules yet. Add one above.</p>

          <div v-for="module in editorModules" :key="module.id" class="content-module">
            <div class="content-module-head">
              <FileStack :size="16" aria-hidden="true" />
              <span class="content-module-title">{{ module.title }}</span>
              <small>seq {{ module.sequence }}</small>
              <button class="content-icon-btn" type="button" title="Remove module" @click="removeModule(module)">
                <Trash2 :size="15" aria-hidden="true" />
              </button>
            </div>

            <div class="content-lessons">
              <div v-for="lesson in lessonsForModule(module.id)" :key="lesson.id" class="content-lesson-row">
                <ListChecks :size="14" aria-hidden="true" />
                <span class="content-lesson-title">{{ lesson.title }}</span>
                <small>{{ lesson.kind }} · {{ lesson.duration_minutes }}m{{ lesson.required ? ' · required' : '' }}</small>
                <button class="content-icon-btn" type="button" title="Remove lesson" @click="removeLesson(lesson)">
                  <Trash2 :size="14" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div class="content-add-lesson">
              <select v-model="lessonDraftFor(module.id).kind" aria-label="Lesson kind">
                <option v-for="option in LESSON_KIND_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <input v-model="lessonDraftFor(module.id).title" type="text" placeholder="Lesson title" autocomplete="off" />
              <input v-model.number="lessonDraftFor(module.id).durationMinutes" type="number" min="0" placeholder="min" aria-label="Duration minutes" />
              <label class="content-required-toggle">
                <input v-model="lessonDraftFor(module.id).required" type="checkbox" />
                Required
              </label>
              <input v-model.number="lessonDraftFor(module.id).passingScore" type="number" min="0" max="100" placeholder="pass %" aria-label="Passing score" />
              <button class="primary-action" type="button" @click="addLesson(module)">
                <Plus :size="16" aria-hidden="true" />
                Add Lesson
              </button>
            </div>
          </div>
          <p v-if="contentError" class="content-error" role="alert">{{ contentError }}</p>
        </section>
      </template>

      <!-- ── Roster & Enrollment view ────────────────────────────────────── -->
      <template v-if="activeView === 'roster' && isLoggedIn && canManageContent">
        <section class="content-panel panel">
          <h2>Assign a course</h2>
          <p>
            Pick a course, check the workers to enroll, and assign. Enrollments are stamped to your
            tenant server-side (RLS) and are idempotent — re-assigning a worker is a no-op.
          </p>
          <div class="roster-assign">
            <label>
              Course
              <select v-model="rosterCourseId" @change="loadCourseEnrollments">
                <option value="">Select a course</option>
                <option v-for="course in courseList" :key="course.id" :value="course.id">{{ course.title }}</option>
              </select>
            </label>
            <button
              class="primary-action roster-assign-btn"
              type="button"
              :disabled="!rosterCourseId || !selectedMemberIds.length"
              @click="assignSelected"
            >
              <ClipboardList :size="18" aria-hidden="true" />
              Assign To {{ selectedMemberIds.length }} Selected
            </button>
          </div>
          <p v-if="rosterError" class="content-error" role="alert">{{ rosterError }}</p>
        </section>

        <section class="tenant-list panel">
          <h2>Tenant members</h2>
          <p v-if="!members.length" class="content-empty">No members in this tenant yet.</p>
          <div v-else class="module-list">
            <label v-for="member in members" :key="member.id" class="roster-member-row">
              <input
                type="checkbox"
                :checked="selectedMemberIds.includes(member.id)"
                @change="toggleMember(member.id)"
              />
              <Users :size="16" aria-hidden="true" />
              <span class="roster-member-name">{{ member.name }}</span>
              <small>{{ member.email }} · {{ member.role }}</small>
            </label>
          </div>
        </section>

        <section class="tenant-list panel">
          <h2>Current enrollments</h2>
          <p v-if="!selectedRosterCourse" class="content-empty">Select a course to see its enrollments.</p>
          <template v-else>
            <p class="content-hint">{{ selectedRosterCourse.title }}</p>
            <p v-if="!courseEnrollments.length" class="content-empty">No one is enrolled in this course yet.</p>
            <div v-else class="module-list">
              <div v-for="enrollment in courseEnrollments" :key="enrollment.id" class="content-row">
                <GraduationCap :size="16" aria-hidden="true" />
                <span>{{ enrollment.memberName }}</span>
                <small>{{ enrollment.status }} · {{ enrollment.progress }}%</small>
              </div>
            </div>
          </template>
        </section>
      </template>

      <!-- ── Reports view (completion / compliance dashboard) ─────────────── -->
      <template v-if="activeView === 'reports' && isLoggedIn && canManageContent">
        <section class="content-panel panel">
          <div class="report-head">
            <div>
              <h2>Completion &amp; compliance</h2>
              <p class="content-hint">
                Who has completed what across your tenant. Read-only; scoped to your tenant
                server-side (RLS).
              </p>
            </div>
            <button class="secondary-action report-refresh" type="button" :disabled="reportLoading" @click="refreshReport">
              <RefreshCw :size="16" aria-hidden="true" />
              {{ reportLoading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>
          <p v-if="reportError" class="content-error" role="alert">{{ reportError }}</p>
        </section>

        <!-- Summary stat tiles -->
        <section class="report-stats" aria-label="Completion summary">
          <article class="report-tile">
            <div class="report-tile-icon report-tile-icon--rate"><TrendingUp :size="20" aria-hidden="true" /></div>
            <div class="report-tile-body">
              <span class="report-tile-label">Completion rate</span>
              <strong class="report-tile-value">{{ report ? report.summary.completionRatePct : 0 }}%</strong>
              <small class="report-tile-sub">{{ report ? report.summary.distinctWorkers : 0 }} worker(s) enrolled</small>
            </div>
          </article>
          <article class="report-tile">
            <div class="report-tile-icon report-tile-icon--complete"><CheckCircle2 :size="20" aria-hidden="true" /></div>
            <div class="report-tile-body">
              <span class="report-tile-label">Completed</span>
              <strong class="report-tile-value">{{ report ? report.summary.completed : 0 }}</strong>
              <small class="report-tile-sub">of {{ report ? report.summary.totalEnrollments : 0 }} enrollment(s)</small>
            </div>
          </article>
          <article class="report-tile">
            <div class="report-tile-icon report-tile-icon--progress"><Loader :size="20" aria-hidden="true" /></div>
            <div class="report-tile-body">
              <span class="report-tile-label">In progress</span>
              <strong class="report-tile-value">{{ report ? report.summary.inProgress : 0 }}</strong>
              <small class="report-tile-sub">{{ report ? report.summary.notStarted : 0 }} not started</small>
            </div>
          </article>
          <article class="report-tile">
            <div class="report-tile-icon report-tile-icon--overdue"><AlertTriangle :size="20" aria-hidden="true" /></div>
            <div class="report-tile-body">
              <span class="report-tile-label">Overdue</span>
              <strong class="report-tile-value">{{ report ? report.summary.overdue : 0 }}</strong>
              <small class="report-tile-sub">{{ report ? report.summary.publishedCourses : 0 }} published course(s)</small>
            </div>
          </article>
        </section>

        <!-- By-course table -->
        <section class="tenant-list panel">
          <h2>By course</h2>
          <p v-if="reportLoading && !report" class="content-empty">Loading report…</p>
          <p v-else-if="!report || !report.byCourse.length" class="content-empty">No enrollments yet.</p>
          <div v-else class="report-table" role="table" aria-label="Completion by course">
            <div class="report-row report-row--head" role="row">
              <span role="columnheader">Course</span>
              <span role="columnheader" class="report-num">Enrolled</span>
              <span role="columnheader" class="report-num">Completed</span>
              <span role="columnheader">Rate</span>
            </div>
            <div v-for="row in report.byCourse" :key="row.courseId" class="report-row" role="row">
              <span class="report-cell-name" role="cell">
                <GraduationCap :size="15" aria-hidden="true" />
                {{ row.title }}
              </span>
              <span class="report-num" role="cell">{{ row.enrolled }}</span>
              <span class="report-num" role="cell">{{ row.completed }}</span>
              <span class="report-rate" role="cell">
                <span class="report-bar" :title="`${row.completionRatePct}% complete`">
                  <span class="report-bar-fill" :style="{ width: `${row.completionRatePct}%` }"></span>
                </span>
                <small class="report-rate-label">{{ row.completionRatePct }}%</small>
              </span>
            </div>
          </div>
        </section>

        <!-- By-worker table -->
        <section class="tenant-list panel">
          <div class="report-head">
            <h2>By worker</h2>
            <button
              class="secondary-action report-refresh"
              type="button"
              :disabled="!report || !report.byWorker.length"
              @click="exportWorkerCsv"
            >
              <Download :size="16" aria-hidden="true" />
              Export CSV
            </button>
          </div>
          <p v-if="reportLoading && !report" class="content-empty">Loading report…</p>
          <p v-else-if="!report || !report.byWorker.length" class="content-empty">No workers enrolled yet.</p>
          <div v-else class="report-table" role="table" aria-label="Completion by worker">
            <div class="report-row report-row--head" role="row">
              <span role="columnheader">Worker</span>
              <span role="columnheader" class="report-num">Assigned</span>
              <span role="columnheader" class="report-num">Completed</span>
              <span role="columnheader">Rate</span>
            </div>
            <div v-for="row in report.byWorker" :key="row.userId" class="report-row" role="row">
              <span class="report-cell-name" role="cell">
                <Users :size="15" aria-hidden="true" />
                <span class="report-worker">
                  <span class="report-worker-name">{{ row.name }}</span>
                  <small v-if="row.email" class="report-worker-email">{{ row.email }}</small>
                </span>
              </span>
              <span class="report-num" role="cell">{{ row.assigned }}</span>
              <span class="report-num" role="cell">{{ row.completed }}</span>
              <span class="report-rate" role="cell">
                <span class="report-bar" :title="`${row.completionRatePct}% complete`">
                  <span class="report-bar-fill" :style="{ width: `${row.completionRatePct}%` }"></span>
                </span>
                <small class="report-rate-label">{{ row.completionRatePct }}%</small>
              </span>
            </div>
          </div>
        </section>

        <!-- Recent completions feed -->
        <section class="tenant-list panel">
          <h2>Recent completions</h2>
          <p v-if="reportLoading && !report" class="content-empty">Loading report…</p>
          <p v-else-if="!report || !report.recentCompletions.length" class="content-empty">No completions recorded yet.</p>
          <div v-else class="module-list">
            <div v-for="item in report.recentCompletions" :key="item.id" class="report-feed-row">
              <CheckCircle2 :size="16" aria-hidden="true" />
              <span class="report-feed-text">
                <strong>{{ item.actorName }}</strong>
                {{ item.verb }}
                <span class="report-feed-object">{{ item.objectLabel }}</span>
              </span>
              <small class="report-feed-time"><Clock :size="12" aria-hidden="true" /> {{ relativeTime(item.occurredAt) }}</small>
            </div>
          </div>
        </section>
      </template>
    </section>
  </main>
</template>
