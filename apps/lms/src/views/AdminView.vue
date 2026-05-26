<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertTriangle, BarChart3, FileDown, HardHat, RefreshCw, Users } from '@lucide/vue'
import type { CertificateDTO, CourseDTO, EnrollmentDTO, UserDTO, UserRole } from '@soteria-forge/shared'
import { api } from '../services/api'
import { flushSyncQueue } from '../offline/sync'
import { getQueuedItems } from '../offline/db'
import SoteriaIcon from '../components/SoteriaIcon.vue'

const report = ref<Record<string, number>>({
  users: 0,
  courses: 0,
  enrollments: 0,
  completed: 0,
  overdue: 0,
  completionRate: 0,
  xapiStatements: 0,
})
const queuedItems = ref(0)
const status = ref('Loading admin dashboard')
const users = ref<UserDTO[]>([])
const courses = ref<CourseDTO[]>([])
const enrollments = ref<EnrollmentDTO[]>([])
const certificates = ref<CertificateDTO[]>([])
const billing = ref<{
  packageName: string
  billingStatus: string
  seatUsed: number
  seatLimit: number
}>({
  packageName: 'No marketplace package',
  billingStatus: 'none',
  seatUsed: 0,
  seatLimit: 0,
})
const userDraft = ref({
  name: '',
  email: '',
  jobTitle: '',
  department: '',
  crew: '',
  site: '',
  roles: 'learner',
})
const selectedCourseId = ref('')
const selectedUserIds = ref<string[]>([])
const dueAt = ref('')
const csvDraft = ref('name,email,jobTitle,department,crew,site,roles\n')

function parseRoles(value: string): UserRole[] {
  return value
    .split(/[|,]/)
    .map((role) => role.trim())
    .filter((role): role is UserRole => ['learner', 'manager', 'admin', 'superadmin'].includes(role))
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }

  cells.push(cell.trim())
  return cells
}

function parseCsvUsers() {
  const [headerLine, ...lines] = csvDraft.value.split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(headerLine).map((header) => header.trim())

  return lines.map((line) => {
    const cells = parseCsvLine(line)
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
    return {
      name: row.name,
      email: row.email,
      jobTitle: row.jobTitle,
      department: row.department,
      crew: row.crew,
      site: row.site,
      roles: parseRoles(row.roles || 'learner'),
    }
  })
}

async function loadReport() {
  status.value = 'Refreshing admin dashboard'
  queuedItems.value = (await getQueuedItems()).length

  try {
    const [reportResponse, usersResponse, coursesResponse, enrollmentsResponse, certificatesResponse, billingResponse] = await Promise.all([
      api.adminCompletionReport(),
      api.adminUsers(),
      api.courses(),
      api.adminEnrollments(),
      api.adminCertificates(),
      api.billingSubscription(),
    ])
    report.value = reportResponse.summary
    users.value = usersResponse.users
    courses.value = coursesResponse.courses
    enrollments.value = enrollmentsResponse.enrollments
    certificates.value = certificatesResponse.certificates
    billing.value = {
      packageName: billingResponse.package?.name ?? 'Manual / dedicated tenant',
      billingStatus: String((billingResponse.subscription as { status?: string } | null)?.status ?? 'manual'),
      seatUsed: billingResponse.seatUsage.used,
      seatLimit: billingResponse.seatUsage.limit,
    }
    selectedCourseId.value ||= courses.value[0]?.id ?? ''
    status.value = 'Live tenant report'
  } catch (error) {
    status.value = error instanceof Error ? `Demo report: ${error.message}` : 'Demo report'
    report.value = {
      users: 48,
      courses: 7,
      enrollments: 132,
      completed: 91,
      overdue: 12,
      completionRate: 69,
      xapiStatements: 1840,
    }
  }
}

async function syncNow() {
  status.value = 'Syncing queued field activity'
  await flushSyncQueue().catch(() => undefined)
  await loadReport()
}

async function createUser() {
  status.value = 'Creating learner'
  await api.adminCreateUser({
    ...userDraft.value,
    roles: parseRoles(userDraft.value.roles),
  })
  userDraft.value = { name: '', email: '', jobTitle: '', department: '', crew: '', site: '', roles: 'learner' }
  await loadReport()
}

async function importUsers() {
  status.value = 'Importing roster'
  await api.adminImportUsers({ users: parseCsvUsers() })
  await loadReport()
}

async function assignCourse() {
  if (!selectedCourseId.value || !selectedUserIds.value.length) return
  status.value = 'Assigning course'
  await api.adminAssignCourse({
    courseId: selectedCourseId.value,
    userIds: selectedUserIds.value,
    dueAt: dueAt.value || undefined,
  })
  selectedUserIds.value = []
  await loadReport()
}

async function openBillingPortal() {
  status.value = 'Opening billing portal'
  const response = await api.billingPortal(window.location.href)
  if (response.portalUrl) {
    window.location.href = response.portalUrl
    return
  }
  status.value = 'Stripe portal is ready once billing credentials are configured.'
}

onMounted(loadReport)
</script>

<template>
  <main class="admin-page">
    <header class="admin-header">
      <div>
        <p class="eyebrow">Client admin</p>
        <h1>Soteria Forge command center</h1>
        <p>{{ status }}</p>
      </div>
      <button class="button button-primary" type="button" @click="syncNow">
        <RefreshCw :size="18" aria-hidden="true" />
        Sync Field Queue
      </button>
    </header>

    <section class="metric-grid">
      <article class="metric-card">
        <Users :size="22" aria-hidden="true" />
        <span>Learners</span>
        <strong>{{ report.users }}</strong>
      </article>
      <article class="metric-card">
        <HardHat :size="22" aria-hidden="true" />
        <span>Published courses</span>
        <strong>{{ report.courses }}</strong>
      </article>
      <article class="metric-card">
        <BarChart3 :size="22" aria-hidden="true" />
        <span>Completion rate</span>
        <strong>{{ report.completionRate }}%</strong>
      </article>
      <article class="metric-card">
        <AlertTriangle :size="22" aria-hidden="true" />
        <span>Overdue</span>
        <strong>{{ report.overdue }}</strong>
      </article>
    </section>

    <section class="admin-grid">
      <article class="admin-panel">
        <SoteriaIcon name="offline-sync" :size="28" decorative />
        <h2>Offline sync health</h2>
        <p>Queued learner activity from low-connectivity crews waits here until the device reconnects.</p>
        <strong>{{ queuedItems }} queued events</strong>
      </article>
      <article class="admin-panel">
        <SoteriaIcon name="audit" :size="28" decorative />
        <h2>Audit-ready exports</h2>
        <p>Completion, certificate, xAPI, and field sign-off exports are shaped for safety and compliance reviews.</p>
        <button class="button button-secondary" type="button">
          <FileDown :size="18" aria-hidden="true" />
          Export Report
        </button>
      </article>
      <article class="admin-panel">
        <SoteriaIcon name="crew-assignment" :size="28" decorative />
        <h2>Roster and crews</h2>
        <p>CSV roster upload, crew assignment, site assignment, and manager-scoped reporting belong in this surface.</p>
      </article>
      <article class="admin-panel">
        <SoteriaIcon name="certificate" :size="28" decorative />
        <h2>Billing and seats</h2>
        <p>{{ billing.packageName }} · {{ billing.billingStatus }}</p>
        <strong>{{ billing.seatUsed }}/{{ billing.seatLimit }} seats</strong>
        <button class="button button-secondary" type="button" @click="openBillingPortal">Manage Billing</button>
      </article>
    </section>

    <section class="admin-workflow-grid">
      <article class="admin-panel">
        <h2>Create learner</h2>
        <form class="admin-form" @submit.prevent="createUser">
          <input v-model="userDraft.name" placeholder="Full name" required />
          <input v-model="userDraft.email" placeholder="Email" type="email" required />
          <input v-model="userDraft.jobTitle" placeholder="Job title" />
          <input v-model="userDraft.department" placeholder="Department" />
          <input v-model="userDraft.crew" placeholder="Crew" />
          <input v-model="userDraft.site" placeholder="Site" />
          <input v-model="userDraft.roles" placeholder="Roles: learner,manager" />
          <button class="button button-primary" type="submit">Create User</button>
        </form>
      </article>

      <article class="admin-panel">
        <h2>CSV roster import</h2>
        <textarea v-model="csvDraft" rows="9" aria-label="CSV roster import"></textarea>
        <button class="button button-secondary" type="button" @click="importUsers">Import Roster</button>
      </article>

      <article class="admin-panel">
        <h2>Assign course</h2>
        <label>
          Course
          <select v-model="selectedCourseId">
            <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.title }}</option>
          </select>
        </label>
        <label>
          Due date
          <input v-model="dueAt" type="date" />
        </label>
        <div class="check-list">
          <label v-for="user in users" :key="user.id">
            <input v-model="selectedUserIds" type="checkbox" :value="user.id" />
            {{ user.name }} · {{ user.department || 'No department' }}
          </label>
        </div>
        <button class="button button-primary" type="button" @click="assignCourse">Assign Selected</button>
      </article>
    </section>

    <section class="admin-data-grid">
      <article class="admin-panel">
        <h2>Learners</h2>
        <div class="compact-table">
          <div v-for="user in users" :key="user.id">
            <strong>{{ user.name }}</strong>
            <span>{{ user.email }}</span>
            <small>{{ user.roles.join(', ') }}</small>
          </div>
        </div>
      </article>

      <article class="admin-panel">
        <h2>Assignments</h2>
        <div class="compact-table">
          <div v-for="enrollment in enrollments" :key="enrollment.id">
            <strong>{{ enrollment.status }}</strong>
            <span>{{ enrollment.progress }}% complete</span>
            <small>{{ enrollment.dueAt ? `Due ${new Date(enrollment.dueAt).toLocaleDateString()}` : 'No due date' }}</small>
          </div>
        </div>
      </article>

      <article class="admin-panel">
        <h2>Certificates</h2>
        <div class="compact-table">
          <div v-for="certificate in certificates" :key="certificate.id">
            <strong>{{ certificate.certificateNumber }}</strong>
            <span>Issued {{ new Date(certificate.issuedAt).toLocaleDateString() }}</span>
            <small>{{ certificate.expiresAt ? `Expires ${new Date(certificate.expiresAt).toLocaleDateString()}` : 'No expiration' }}</small>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
