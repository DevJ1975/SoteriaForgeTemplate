<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import forgeLogo from '../assets/template-logo.svg'
import { setSeo } from '../utils/seo'

const route = useRoute()
const pages: Record<string, { title: string; copy: string[] }> = {
  terms: {
    title: 'Terms of Service',
    copy: [
      'Soteria FORGE provides subscription access to online training, course previews, completion records, and tenant workspaces.',
      'Customers are responsible for assigning training appropriately and confirming any local compliance requirement before relying on a course as regulatory proof.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    copy: [
      'Soteria FORGE stores account, tenant, course progress, billing reference, lead, and analytics data needed to operate the service.',
      'Payment details are handled by Stripe. Soteria FORGE does not store raw card or Apple Pay credential data.',
    ],
  },
  'refund-policy': {
    title: 'Refund Policy',
    copy: [
      'Monthly subscriptions can be managed through the Stripe Customer Portal when billing is active.',
      'Refund requests should include the buyer email, workspace name, package, and reason so support can review account access and usage.',
    ],
  },
  accessibility: {
    title: 'Accessibility',
    copy: [
      'Soteria FORGE is designed for keyboard access, readable contrast, mobile use, and low-bandwidth field conditions.',
      'Course authors should provide transcripts, captions, and offline summaries for field-friendly access.',
    ],
  },
}

const page = computed(() => pages[String(route.name)] ?? pages.terms)

onMounted(() => {
  setSeo({
    title: `${page.value.title} | Soteria FORGE`,
    description: page.value.copy[0],
    path: route.path,
  })
})
</script>

<template>
  <main class="public-page legal-page">
    <header class="public-nav">
      <RouterLink class="public-logo" to="/"><img :src="forgeLogo" alt="Soteria FORGE" /></RouterLink>
      <nav>
        <RouterLink to="/courses">Courses</RouterLink>
        <RouterLink to="/pricing">Pricing</RouterLink>
        <RouterLink class="nav-login" to="/login">Login</RouterLink>
      </nav>
    </header>
    <section class="checkout-panel">
      <p class="eyebrow">Soteria FORGE</p>
      <h1>{{ page.title }}</h1>
      <p v-for="copy in page.copy" :key="copy">{{ copy }}</p>
      <p>These starter policies should be reviewed by counsel before public launch with paid customers.</p>
    </section>
  </main>
</template>
