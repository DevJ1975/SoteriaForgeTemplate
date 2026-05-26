<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertTriangle, BarChart3, FileDown, HardHat, RefreshCw, Users } from '@lucide/vue'
import { api } from '../services/api'
import { flushSyncQueue } from '../offline/sync'
import { getQueuedItems } from '../offline/db'

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

async function loadReport() {
  status.value = 'Refreshing admin dashboard'
  queuedItems.value = (await getQueuedItems()).length

  try {
    const response = await api.adminCompletionReport()
    report.value = response.summary
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
        <h2>Offline sync health</h2>
        <p>Queued learner activity from low-connectivity crews waits here until the device reconnects.</p>
        <strong>{{ queuedItems }} queued events</strong>
      </article>
      <article class="admin-panel">
        <h2>Audit-ready exports</h2>
        <p>Completion, certificate, xAPI, and field sign-off exports are shaped for safety and compliance reviews.</p>
        <button class="button button-secondary" type="button">
          <FileDown :size="18" aria-hidden="true" />
          Export Report
        </button>
      </article>
      <article class="admin-panel">
        <h2>Roster and crews</h2>
        <p>CSV roster upload, crew assignment, site assignment, and manager-scoped reporting belong in this surface.</p>
      </article>
    </section>
  </main>
</template>
