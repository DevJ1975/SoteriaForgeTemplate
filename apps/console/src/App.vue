<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookOpenCheck, Building2, CopyPlus, FileStack, LibraryBig, RadioTower, ShieldCheck, WandSparkles } from '@lucide/vue'
import { normalizeTenantSlug, type CourseDTO, type TenantDTO } from '@soteria-forge/shared'

const tenantName = ref('Acme Industrial Services')
const tenantSlug = computed(() => normalizeTenantSlug(tenantName.value))
const courseTitle = ref('Confined Space Entry Refresher')
const sopSource = ref('Paste an SOP, toolbox talk, or safety bulletin here to draft modules, quiz checks, and sign-off steps.')

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
        </div>
        <button class="primary-action" type="button">
          <CopyPlus :size="18" aria-hidden="true" />
          Clone Template
        </button>
      </header>

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
        </article>
      </section>
    </section>
  </main>
</template>
