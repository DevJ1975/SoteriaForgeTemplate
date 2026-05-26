<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, Building2, Check, UserRound } from '@lucide/vue'
import type { CourseDTO, ProductPackageDTO } from '@soteria-forge/shared'
import templateLogo from '../assets/template-logo.svg'
import SoteriaIcon from '../components/SoteriaIcon.vue'
import { api } from '../services/api'

const packages = ref<ProductPackageDTO[]>([])
const courses = ref<CourseDTO[]>([])
const selectedPackageSlug = ref('starter')
const buyerType = ref<'individual' | 'company'>('individual')
const buyerName = ref('')
const buyerEmail = ref('')
const companyName = ref('')
const seatCount = ref(1)
const status = ref('Loading course marketplace')

const selectedPackage = computed(() => packages.value.find((productPackage) => productPackage.slug === selectedPackageSlug.value))
const visibleCourses = computed(() => courses.value.slice(0, 6))

function packageIcon(slug: string) {
  if (slug.includes('compliance')) return 'audit'
  if (slug.includes('field')) return 'field-readiness'
  if (slug.includes('dedicated')) return 'course-builder'
  return 'e-learning'
}

async function loadCatalog() {
  status.value = 'Loading course marketplace'
  try {
    const [packageResponse, courseResponse] = await Promise.all([api.catalogPackages(), api.catalogCourses()])
    packages.value = packageResponse.packages
    courses.value = courseResponse.courses
    selectedPackageSlug.value = packages.value[0]?.slug ?? 'starter'
    status.value = 'Monthly course access for small teams'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to load catalog'
  }
}

async function startCheckout() {
  if (!selectedPackage.value) return
  status.value = 'Preparing checkout'

  const response = await api.checkoutSession({
    packageSlug: selectedPackage.value.slug,
    buyerType: buyerType.value,
    buyerName: buyerName.value || (buyerType.value === 'company' ? companyName.value : 'Soteria Learner'),
    buyerEmail: buyerEmail.value,
    companyName: buyerType.value === 'company' ? companyName.value : undefined,
    seatCount: buyerType.value === 'company' ? seatCount.value : 1,
    successUrl: `${window.location.origin}/?checkout=success`,
    cancelUrl: `${window.location.origin}/catalog?checkout=cancelled`,
  })

  if (response.mode === 'stripe') {
    window.location.href = response.checkoutUrl
    return
  }

  status.value = 'Stripe price IDs are not configured yet. The marketplace package is ready for checkout setup.'
}

onMounted(loadCatalog)
</script>

<template>
  <main class="catalog-page">
    <header class="catalog-topbar">
      <div class="catalog-brand">
        <img :src="templateLogo" alt="Soteria Forge" />
        <span>Soteria Forge</span>
      </div>
      <nav>
        <RouterLink to="/">Login</RouterLink>
        <RouterLink to="/admin">Admin</RouterLink>
      </nav>
    </header>

    <section class="catalog-hero">
      <div>
        <p class="eyebrow">Course marketplace</p>
        <h1>Monthly safety training without annual contracts</h1>
        <p>
          Buy course access for yourself or a small company, invite learners, track certificates, and move into a
          dedicated tenant when your rollout grows.
        </p>
        <div class="catalog-actions">
          <a href="#packages" class="button button-primary">
            View Packages
            <ArrowRight :size="18" aria-hidden="true" />
          </a>
          <RouterLink to="/" class="button button-secondary">Learner Login</RouterLink>
        </div>
      </div>
      <div class="catalog-signal">
        <strong>{{ packages.length }}</strong>
        <span>monthly packages</span>
        <strong>{{ courses.length }}</strong>
        <span>catalog courses</span>
      </div>
    </section>

    <section id="packages" class="package-section">
      <div class="section-heading">
        <p class="eyebrow">Self-service packages</p>
        <h2>{{ status }}</h2>
      </div>
      <div class="package-grid">
        <article
          v-for="productPackage in packages"
          :key="productPackage.id"
          class="package-card"
          :class="{ selected: selectedPackageSlug === productPackage.slug }"
        >
          <SoteriaIcon :name="packageIcon(productPackage.slug)" :size="28" decorative />
          <h3>{{ productPackage.name }}</h3>
          <p>{{ productPackage.description }}</p>
          <strong>{{ productPackage.priceLabel || 'Monthly subscription' }}</strong>
          <span>{{ productPackage.seatLimit }} learner seats included</span>
          <ul>
            <li v-for="(enabled, feature) in productPackage.featureFlags" :key="feature">
              <Check v-if="enabled" :size="15" aria-hidden="true" />
              {{ feature }}
            </li>
          </ul>
          <button class="button button-primary" type="button" @click="selectedPackageSlug = productPackage.slug">
            Select Package
          </button>
        </article>
      </div>
    </section>

    <section class="checkout-section">
      <article class="checkout-panel">
        <h2>Start monthly access</h2>
        <div class="buyer-toggle" role="group" aria-label="Buyer type">
          <button type="button" :class="{ active: buyerType === 'individual' }" @click="buyerType = 'individual'">
            <UserRound :size="17" aria-hidden="true" />
            Individual
          </button>
          <button type="button" :class="{ active: buyerType === 'company' }" @click="buyerType = 'company'">
            <Building2 :size="17" aria-hidden="true" />
            Company
          </button>
        </div>
        <form class="admin-form" @submit.prevent="startCheckout">
          <label>
            Package
            <select v-model="selectedPackageSlug">
              <option v-for="productPackage in packages" :key="productPackage.id" :value="productPackage.slug">
                {{ productPackage.name }}
              </option>
            </select>
          </label>
          <input v-model="buyerName" placeholder="Your name" required />
          <input v-model="buyerEmail" placeholder="Email" type="email" required />
          <input v-if="buyerType === 'company'" v-model="companyName" placeholder="Company name" required />
          <input v-if="buyerType === 'company'" v-model.number="seatCount" min="1" type="number" />
          <button class="button button-primary" type="submit">Continue To Checkout</button>
        </form>
      </article>

      <article class="checkout-panel">
        <h2>Course previews</h2>
        <div class="catalog-course-list">
          <div v-for="course in visibleCourses" :key="course.id">
            <strong>{{ course.title }}</strong>
            <span>{{ course.description }}</span>
            <small>{{ course.fieldReadinessScore }} field readiness score</small>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
