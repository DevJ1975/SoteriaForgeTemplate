<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpenCheck, Building2, CopyPlus, FileStack, LibraryBig, MailPlus, RadioTower, ShieldCheck, UserPlus, WandSparkles } from '@lucide/vue'
import { normalizeTenantSlug, type CourseDTO, type ProductPackageDTO, type TenantDTO, type UserDTO, type UserRole } from '@soteria-forge/shared'
import forgeLogo from './assets/brand/logos/soteria-forge-horizontal.svg'
import { consoleApi, INVITABLE_ROLES, type InvitableRole } from './services/api'
import type { InvitationRow } from '@soteria-forge/shared/supabase'

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
        <button class="nav-active" type="button"><Building2 :size="18" /> Tenants</button>
        <button type="button"><LibraryBig :size="18" /> Global Library</button>
        <button type="button"><ShieldCheck :size="18" /> Packages</button>
        <button type="button"><WandSparkles :size="18" /> Course Creator</button>
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
    </section>
  </main>
</template>
