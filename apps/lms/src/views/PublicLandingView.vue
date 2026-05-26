<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, BadgeCheck, CreditCard, ShieldCheck, WalletCards } from '@lucide/vue'
import type { CatalogLandingDTO, ProductPackageDTO, PublicCourseDTO } from '@soteria-forge/shared'
import forgeLogo from '../assets/template-logo.svg'
import SoteriaIcon from '../components/SoteriaIcon.vue'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'

const landing = ref<CatalogLandingDTO | null>(null)
const status = ref('Loading Soteria FORGE')

const packages = computed<ProductPackageDTO[]>(() => landing.value?.packages ?? [])
const courses = computed<PublicCourseDTO[]>(() => landing.value?.courses ?? [])
const stats = computed(() => landing.value?.stats ?? { packages: 0, courses: 0, categories: 0, certificateCourses: 0 })

const categories = [
  { icon: 'field-readiness', title: 'Field readiness', copy: 'Microlearning for crews who need training to work when signal is unreliable.' },
  { icon: 'offline-sync', title: 'Offline support', copy: 'Queue progress and support materials for job sites, yards, trucks, and austere conditions.' },
  { icon: 'certificate', title: 'Certificate records', copy: 'Keep completion proof, retraining signals, and audit-friendly records in one workspace.' },
]

const faqs = [
  ['Can a small company pay month to month?', 'Yes. Packages are monthly subscriptions through Stripe Checkout with no annual contract required.'],
  ['Does Apple Pay work?', 'Stripe Checkout can show Apple Pay on eligible Apple devices after the Stripe payment domain setup is complete.'],
  ['Can this become a dedicated tenant later?', 'Yes. Superadmin can convert a marketplace workspace to a branded dedicated implementation without losing records.'],
]

onMounted(async () => {
  setSeo({
    title: 'Soteria FORGE | Monthly safety training for field teams',
    description:
      'Buy monthly access to field-ready safety courses, certificates, offline support, and compliance training without annual contracts.',
    path: '/',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Soteria FORGE',
      url: 'https://soteria-forge-lms.vercel.app',
      logo: 'https://soteria-forge-lms.vercel.app/favicon.svg',
    },
  })
  try {
    landing.value = await api.catalogLanding()
    status.value = 'Marketplace ready'
    void api.trackEvent({ eventName: 'landing_view', sourcePath: window.location.pathname })
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Marketplace is loading'
  }
})
</script>

<template>
  <main class="public-page">
    <header class="public-nav">
      <RouterLink class="public-logo" to="/">
        <img :src="forgeLogo" alt="Soteria FORGE" />
      </RouterLink>
      <nav>
        <RouterLink to="/courses">Courses</RouterLink>
        <RouterLink to="/pricing">Pricing</RouterLink>
        <RouterLink to="/contact">Dedicated rollout</RouterLink>
        <RouterLink class="nav-login" to="/login">Login</RouterLink>
      </nav>
    </header>

    <section class="public-hero">
      <div class="hero-copy">
        <p class="eyebrow">Field Operations Readiness & Growth Engine</p>
        <h1>Monthly safety training without annual contracts.</h1>
        <p>
          Soteria FORGE helps small companies and individual learners buy access to industrial, construction, and field
          readiness courses with certificates, offline-friendly support, and Stripe Checkout.
        </p>
        <div class="catalog-actions">
          <RouterLink class="button button-primary" to="/pricing">
            View monthly packages
            <ArrowRight :size="18" aria-hidden="true" />
          </RouterLink>
          <RouterLink class="button button-secondary" to="/courses">Browse courses</RouterLink>
        </div>
        <div class="wallet-row" aria-label="Payment methods">
          <WalletCards :size="18" aria-hidden="true" />
          <span>Stripe Checkout supports cards, Link, and eligible Apple Pay wallets.</span>
        </div>
      </div>
      <aside class="hero-proof" aria-label="Marketplace summary">
        <img :src="forgeLogo" alt="" />
        <strong>{{ stats.packages }}</strong>
        <span>monthly packages</span>
        <strong>{{ stats.courses }}</strong>
        <span>public course previews</span>
        <p>{{ status }}</p>
      </aside>
    </section>

    <section class="public-section public-three">
      <article v-for="category in categories" :key="category.title" class="public-card">
        <SoteriaIcon :name="category.icon" :size="30" decorative />
        <h2>{{ category.title }}</h2>
        <p>{{ category.copy }}</p>
      </article>
    </section>

    <section class="public-section split-band">
      <div>
        <p class="eyebrow">Marketplace courses</p>
        <h2>Preview course outcomes before you buy.</h2>
        <p>
          Public course pages show outcomes, duration, certificate value, and a free preview lesson. Full lessons stay
          behind package entitlements.
        </p>
        <RouterLink class="button button-secondary" to="/courses">Explore all courses</RouterLink>
      </div>
      <div class="course-preview-list">
        <RouterLink v-for="course in courses" :key="course.id" :to="`/courses/${course.slug}`" class="course-preview-row">
          <span>{{ course.category }}</span>
          <strong>{{ course.title }}</strong>
          <small>{{ course.fieldReadinessScore }} field readiness score</small>
        </RouterLink>
      </div>
    </section>

    <section class="public-section">
      <div class="section-heading">
        <p class="eyebrow">Monthly access</p>
        <h2>Start small. Convert to dedicated tenant mode when the rollout grows.</h2>
      </div>
      <div class="package-grid">
        <article v-for="productPackage in packages" :key="productPackage.id" class="package-card" :class="{ selected: productPackage.featured }">
          <SoteriaIcon :name="productPackage.featured ? 'field-readiness' : 'e-learning'" :size="28" decorative />
          <span>{{ productPackage.bestFor }}</span>
          <h3>{{ productPackage.name }}</h3>
          <p>{{ productPackage.headline || productPackage.description }}</p>
          <strong>{{ productPackage.displayPriceLabel || productPackage.priceLabel || 'Monthly subscription' }}</strong>
          <small>{{ productPackage.seatLabel || `${productPackage.seatLimit} learner seats` }}</small>
          <RouterLink class="button button-primary" :to="`/pricing?package=${productPackage.slug}`">
            {{ productPackage.ctaLabel || 'Choose package' }}
          </RouterLink>
        </article>
      </div>
    </section>

    <section class="public-section trust-grid">
      <div>
        <ShieldCheck :size="30" aria-hidden="true" />
        <h2>Paywall with records preserved</h2>
        <p>Subscriptions unlock courses through tenant entitlements. Cancellations preserve users, completions, and certificates.</p>
      </div>
      <div>
        <CreditCard :size="30" aria-hidden="true" />
        <h2>Stripe-hosted checkout</h2>
        <p>Apple Pay can appear in Stripe Checkout after payment domains, HTTPS, and wallet requirements are configured.</p>
      </div>
      <div>
        <BadgeCheck :size="30" aria-hidden="true" />
        <h2>Designed for job sites</h2>
        <p>Microlearning, field-readiness scores, low-bandwidth support, certificates, and supervisor-oriented workflows.</p>
      </div>
    </section>

    <section class="public-section faq-section">
      <div v-for="[question, answer] in faqs" :key="question">
        <h3>{{ question }}</h3>
        <p>{{ answer }}</p>
      </div>
    </section>
  </main>
</template>
