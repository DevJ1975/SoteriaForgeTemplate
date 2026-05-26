<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { PublicCourseDTO } from '@soteria-forge/shared'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'
import forgeLogo from '../assets/template-logo.svg'

const courses = ref<PublicCourseDTO[]>([])
const q = ref('')
const category = ref('')
const role = ref('')
const topic = ref('')
const certificate = ref(false)
const status = ref('Loading public course catalog')

const categories = computed(() => [...new Set(courses.value.map((course) => course.category))])
const roles = computed(() => [...new Set(courses.value.map((course) => course.role))])
const topics = computed(() => [...new Set(courses.value.map((course) => course.topic))])

async function loadCourses() {
  status.value = 'Loading public course catalog'
  const response = await api.catalogCourses({
    q: q.value,
    category: category.value,
    role: role.value,
    topic: topic.value,
    certificate: certificate.value ? 'true' : '',
  })
  courses.value = response.courses
  status.value = `${courses.value.length} course previews`
}

watch([q, category, role, topic, certificate], () => void loadCourses())

onMounted(async () => {
  setSeo({
    title: 'Soteria FORGE Courses | Public safety training catalog',
    description: 'Browse public previews for Soteria FORGE field safety, compliance, and operational readiness courses.',
    path: '/courses',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Soteria FORGE course catalog',
    },
  })
  await loadCourses()
  void api.trackEvent({ eventName: 'catalog_view', sourcePath: window.location.pathname })
})
</script>

<template>
  <main class="public-page">
    <header class="public-nav">
      <RouterLink class="public-logo" to="/"><img :src="forgeLogo" alt="Soteria FORGE" /></RouterLink>
      <nav>
        <RouterLink to="/pricing">Pricing</RouterLink>
        <RouterLink to="/contact">Dedicated rollout</RouterLink>
        <RouterLink class="nav-login" to="/login">Login</RouterLink>
      </nav>
    </header>

    <section class="catalog-heading">
      <p class="eyebrow">Course catalog</p>
      <h1>Preview field-ready training before you unlock it.</h1>
      <p>Course pages expose outcomes and sample lesson details. Full training remains behind package entitlement.</p>
    </section>

    <section class="catalog-filters">
      <input v-model="q" placeholder="Search courses" />
      <select v-model="category">
        <option value="">All industries</option>
        <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="role">
        <option value="">All roles</option>
        <option v-for="item in roles" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="topic">
        <option value="">All topics</option>
        <option v-for="item in topics" :key="item" :value="item">{{ item }}</option>
      </select>
      <label class="filter-check"><input v-model="certificate" type="checkbox" /> Certificate</label>
    </section>

    <section class="public-section">
      <div class="section-heading">
        <p class="eyebrow">Public previews</p>
        <h2>{{ status }}</h2>
      </div>
      <div class="public-course-grid">
        <RouterLink v-for="course in courses" :key="course.id" class="public-course-card" :to="`/courses/${course.slug}`">
          <span>{{ course.category }} · {{ course.durationMinutes }} min</span>
          <h2>{{ course.title }}</h2>
          <p>{{ course.publicSummary }}</p>
          <strong>{{ course.fieldReadinessScore }} field readiness score</strong>
          <small>{{ course.certificateLabel }}</small>
        </RouterLink>
      </div>
    </section>
  </main>
</template>
