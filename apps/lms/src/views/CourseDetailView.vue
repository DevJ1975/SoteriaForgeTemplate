<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ProductPackageDTO, PublicCourseDTO } from '@soteria-forge/shared'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'
import forgeLogo from '../assets/template-logo.svg'

const route = useRoute()
const course = ref<PublicCourseDTO | null>(null)
const packages = ref<ProductPackageDTO[]>([])
const status = ref('Loading course preview')

const includedPackages = computed(() =>
  packages.value.filter((productPackage) => course.value?.includedPackageIds.includes(productPackage.id)),
)

onMounted(async () => {
  const slug = String(route.params.slug)
  const [courseResponse, packageResponse] = await Promise.all([api.catalogCourse(slug), api.catalogPackages()])
  course.value = courseResponse.course
  packages.value = packageResponse.packages
  status.value = 'Preview available'
  setSeo({
    title: `${course.value.title} | Soteria FORGE course preview`,
    description: course.value.publicSummary,
    path: `/courses/${course.value.slug}`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.value.title,
      description: course.value.publicSummary,
      provider: { '@type': 'Organization', name: 'Soteria FORGE' },
    },
  })
  void api.trackEvent({ eventName: 'course_preview_view', sourcePath: window.location.pathname, courseSlug: slug })
})
</script>

<template>
  <main class="public-page">
    <header class="public-nav">
      <RouterLink class="public-logo" to="/"><img :src="forgeLogo" alt="Soteria FORGE" /></RouterLink>
      <nav>
        <RouterLink to="/courses">Courses</RouterLink>
        <RouterLink to="/pricing">Pricing</RouterLink>
        <RouterLink class="nav-login" to="/login">Login</RouterLink>
      </nav>
    </header>

    <section v-if="course" class="course-detail-hero">
      <div>
        <p class="eyebrow">{{ course.category }} · {{ course.role }}</p>
        <h1>{{ course.title }}</h1>
        <p>{{ course.publicSummary }}</p>
        <div class="catalog-actions">
          <RouterLink class="button button-primary" :to="`/pricing?course=${course.slug}`">Unlock with package</RouterLink>
          <RouterLink class="button button-secondary" to="/courses">Back to catalog</RouterLink>
        </div>
      </div>
      <aside class="paywall-card">
        <strong>{{ course.fieldReadinessScore }}</strong>
        <span>field readiness score</span>
        <p>{{ status }}</p>
      </aside>
    </section>

    <section v-if="course" class="public-section split-band">
      <div>
        <p class="eyebrow">Free preview lesson</p>
        <h2>{{ course.previewLesson?.title }}</h2>
        <p>{{ course.previewLesson?.description }}</p>
        <small>{{ course.previewLesson?.durationMinutes }} min · {{ course.previewLesson?.kind }}</small>
      </div>
      <div class="locked-panel">
        <h2>Full course locked</h2>
        <p>Videos, quizzes, attempts, xAPI activity, certificates, and downloadable job aids unlock after checkout.</p>
        <RouterLink class="button button-primary" :to="`/pricing?course=${course.slug}`">Choose monthly access</RouterLink>
      </div>
    </section>

    <section v-if="course" class="public-section public-three">
      <article class="public-card">
        <h2>Outcomes</h2>
        <ul>
          <li v-for="outcome in course.outcomes" :key="outcome">{{ outcome }}</li>
        </ul>
      </article>
      <article class="public-card">
        <h2>Audience</h2>
        <ul>
          <li v-for="audience in course.audience" :key="audience">{{ audience }}</li>
        </ul>
      </article>
      <article class="public-card">
        <h2>Included packages</h2>
        <ul>
          <li v-for="productPackage in includedPackages" :key="productPackage.id">{{ productPackage.name }}</li>
        </ul>
      </article>
    </section>
  </main>
</template>
