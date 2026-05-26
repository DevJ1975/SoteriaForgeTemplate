<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Building2, Check, ShieldCheck, UserRound, WalletCards } from '@lucide/vue'
import type { ProductPackageDTO, PublicCourseDTO } from '@soteria-forge/shared'
import forgeLogo from '../assets/template-logo.svg'
import SoteriaIcon from '../components/SoteriaIcon.vue'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'

const route = useRoute()
const packages = ref<ProductPackageDTO[]>([])
const courses = ref<PublicCourseDTO[]>([])
const selectedPackageSlug = ref(String(route.query.package ?? 'starter'))
const courseSlug = computed(() => String(route.query.course ?? ''))
const buyerType = ref<'individual' | 'company'>('individual')
const buyerName = ref('')
const buyerEmail = ref('')
const companyName = ref('')
const seatCount = ref(1)
const status = ref('Loading monthly packages')

const selectedPackage = computed(() => packages.value.find((productPackage) => productPackage.slug === selectedPackageSlug.value))
const selectedCourse = computed(() => courses.value.find((course) => course.slug === courseSlug.value))

function iconForPackage(slug: string) {
  if (slug.includes('compliance')) return 'audit'
  if (slug.includes('field')) return 'field-readiness'
  if (slug.includes('dedicated')) return 'course-builder'
  return 'e-learning'
}

function featureLabel(feature: string) {
  const labels: Record<string, string> = {
    certificates: 'Certificates',
    offlineMode: 'Offline mode',
    managerReports: 'Manager reports',
    dedicatedSubdomain: 'Dedicated subdomain',
    branding: 'Custom branding',
    scorm: 'SCORM support',
    xapi: 'xAPI records',
    courseCreator: 'Course creator',
  }

  return labels[feature] ?? feature.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

async function startCheckout() {
  if (!selectedPackage.value) return
  status.value = 'Preparing Stripe Checkout'
  void api.trackEvent({
    eventName: 'checkout_start',
    sourcePath: window.location.pathname,
    packageSlug: selectedPackage.value.slug,
    courseSlug: courseSlug.value || undefined,
  })

  const response = await api.checkoutSession({
    packageSlug: selectedPackage.value.slug,
    buyerType: buyerType.value,
    buyerName: buyerName.value || (buyerType.value === 'company' ? companyName.value : 'Soteria Learner'),
    buyerEmail: buyerEmail.value,
    companyName: buyerType.value === 'company' ? companyName.value : undefined,
    seatCount: buyerType.value === 'company' ? seatCount.value : 1,
    courseSlug: courseSlug.value || undefined,
    successUrl: `${window.location.origin}/checkout/success?package=${selectedPackage.value.slug}`,
    cancelUrl: `${window.location.origin}/pricing?checkout=cancelled`,
  })

  if (response.mode === 'stripe') {
    window.location.href = response.checkoutUrl
    return
  }

  status.value = 'Stripe price IDs are not configured yet. This package is ready for checkout setup.'
}

onMounted(async () => {
  setSeo({
    title: 'Soteria FORGE Pricing | Monthly safety course subscriptions',
    description:
      'Compare monthly Soteria FORGE course packages for individuals and small companies. Checkout is powered by Stripe and eligible Apple Pay wallets.',
    path: '/pricing',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'OfferCatalog',
      name: 'Soteria FORGE monthly course packages',
    },
  })
  const [packageResponse, courseResponse] = await Promise.all([api.catalogPackages(), api.catalogCourses()])
  packages.value = packageResponse.packages
  courses.value = courseResponse.courses
  if (!packages.value.some((productPackage) => productPackage.slug === selectedPackageSlug.value)) {
    selectedPackageSlug.value = packages.value[0]?.slug ?? 'starter'
  }
  status.value = 'Monthly packages available'
})
</script>

<template>
  <main class="public-page">
    <header class="public-nav">
      <RouterLink class="public-logo" to="/"><img :src="forgeLogo" alt="Soteria FORGE" /></RouterLink>
      <nav>
        <RouterLink to="/courses">Courses</RouterLink>
        <RouterLink to="/contact">Dedicated rollout</RouterLink>
        <RouterLink class="nav-login" to="/login">Login</RouterLink>
      </nav>
    </header>

    <section class="catalog-heading">
      <p class="eyebrow">Pricing</p>
      <h1>Monthly access for individuals and small companies.</h1>
      <p>
        Choose a package, checkout with Stripe, and unlock a workspace tenant. Apple Pay can appear for eligible
        customers once Stripe payment domains are configured.
      </p>
    </section>

    <section class="public-section pricing-layout">
      <div>
        <div class="package-grid pricing-grid">
          <article
            v-for="productPackage in packages"
            :key="productPackage.id"
            class="package-card"
            :class="{ selected: selectedPackageSlug === productPackage.slug }"
          >
            <SoteriaIcon :name="iconForPackage(productPackage.slug)" :size="28" decorative />
            <span>{{ productPackage.bestFor }}</span>
            <h2>{{ productPackage.name }}</h2>
            <p>{{ productPackage.description }}</p>
            <strong>{{ productPackage.displayPriceLabel || productPackage.priceLabel || 'Monthly subscription' }}</strong>
            <small>{{ productPackage.trialLabel }} · {{ productPackage.seatLabel || `${productPackage.seatLimit} seats` }}</small>
            <ul>
              <li v-for="(enabled, feature) in productPackage.featureFlags" :key="feature">
                <Check v-if="enabled" :size="15" aria-hidden="true" />
                {{ featureLabel(String(feature)) }}
              </li>
            </ul>
            <button class="button button-primary" type="button" @click="selectedPackageSlug = productPackage.slug">
              {{ productPackage.ctaLabel || 'Select package' }}
            </button>
          </article>
        </div>
      </div>

      <aside class="checkout-panel sticky-checkout">
        <h2>Start monthly access</h2>
        <p v-if="selectedCourse">Unlocking preview: {{ selectedCourse.title }}</p>
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
          <button class="button button-primary" type="submit">Continue to Stripe Checkout</button>
        </form>
        <div class="wallet-row">
          <WalletCards :size="18" aria-hidden="true" />
          <span>Cards, Link, coupons, and eligible Apple Pay wallets through Stripe Checkout.</span>
        </div>
        <div class="wallet-row">
          <ShieldCheck :size="18" aria-hidden="true" />
          <span>{{ status }}</span>
        </div>
      </aside>
    </section>
  </main>
</template>
