<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import forgeLogo from '../assets/template-logo.svg'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'

onMounted(() => {
  setSeo({
    title: 'Checkout received | Soteria FORGE',
    description: 'Your Soteria FORGE checkout has been received. Stripe will confirm access and apply course entitlements.',
    noindex: true,
  })
  void api.trackEvent({ eventName: 'checkout_success', sourcePath: window.location.pathname })
})
</script>

<template>
  <main class="public-page success-page">
    <img :src="forgeLogo" alt="Soteria FORGE" />
    <section class="checkout-panel">
      <p class="eyebrow">Checkout received</p>
      <h1>Your workspace is being prepared.</h1>
      <p>
        Stripe will confirm the subscription, then Soteria FORGE applies the package entitlement, creates your workspace,
        and assigns included courses. If the webhook is still processing, refresh after a moment.
      </p>
      <div class="catalog-actions">
        <RouterLink class="button button-primary" to="/login">Go to login</RouterLink>
        <RouterLink class="button button-secondary" to="/courses">Browse course previews</RouterLink>
      </div>
    </section>
  </main>
</template>
