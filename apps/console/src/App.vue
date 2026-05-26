<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpenCheck, Building2, CopyPlus, FileStack, LibraryBig, RadioTower, ShieldCheck, WandSparkles } from '@lucide/vue'
import { normalizeTenantSlug, type CourseDTO, type TenantDTO } from '@soteria-forge/shared'
import { consoleApi } from './services/api'

const tenantName = ref('Acme Industrial Services')
const tenantSlug = computed(() => normalizeTenantSlug(tenantName.value))
const courseTitle = ref('Confined Space Entry Refresher')
const sopSource = ref('Paste an SOP, toolbox talk, or safety bulletin here to draft modules, quiz checks, and sign-off steps.')
const email = ref('superadmin@soteriaforge.local')
const password = ref('SoteriaForgeDemo!2026')
const tenantLoginSlug = ref('demo')
const status = ref('Sign in to manage tenants and course drafts.')
const isLoggedIn = ref(Boolean(localStorage.getItem('soteria-forge-console:token')))
const tenants = ref<TenantDTO[]>([])
const selectedTenantSlug = ref('demo')
const savedCourse = ref<CourseDTO | null>(null)

const tenantPreview = computed<TenantDTO>(() => ({
  id: 'preview',
  name: tenantName.value,
  slug: tenantSlug.value,
  domains: [`${tenantSlug.value}.soteriaforge.com`],
  status: 'trial',
  branding: {
    appName: tenantName.value,
    primaryColor: '#1f3f86',
    accentColor: '#c9a84e',
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
  await consoleApi.login(email.value, password.value, tenantLoginSlug.value)
  isLoggedIn.value = true
  status.value = 'Signed in as superadmin'
  await loadTenants()
}

async function loadTenants() {
  const response = await consoleApi.tenants()
  tenants.value = response.tenants
  selectedTenantSlug.value = tenants.value[0]?.slug ?? 'demo'
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
  localStorage.setItem('soteria-forge-console:tenantSlug', selectedTenantSlug.value)
  const response = await consoleApi.createCourse(coursePreview.value)
  savedCourse.value = response.course
  status.value = `Saved draft: ${response.course.title}`
}

async function publishDraftCourse() {
  if (!savedCourse.value) return
  status.value = 'Publishing course'
  localStorage.setItem('soteria-forge-console:tenantSlug', selectedTenantSlug.value)
  const response = await consoleApi.publishCourse(savedCourse.value.id)
  savedCourse.value = response.course
  status.value = `Published: ${response.course.title}`
}

onMounted(() => {
  if (isLoggedIn.value) {
    void loadTenants().catch((error) => {
      status.value = error instanceof Error ? error.message : 'Unable to load tenants'
    })
  }
})
</script>

<template>
  <main class="console-shell">
    <aside class="console-sidebar">
      <div class="brand-lockup">
        <ShieldCheck :size="30" aria-hidden="true" />
        <span>Soteria Forge</span>
      </div>
      <nav>
        <button class="nav-active" type="button"><Building2 :size="18" /> Tenants</button>
        <button type="button"><LibraryBig :size="18" /> Global Library</button>
        <button type="button"><WandSparkles :size="18" /> Course Creator</button>
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
    </section>
  </main>
</template>
