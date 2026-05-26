<script setup lang="ts">
import { onMounted, ref } from 'vue'
import forgeLogo from '../assets/template-logo.svg'
import { api } from '../services/api'
import { setSeo } from '../utils/seo'

const lead = ref({
  name: '',
  email: '',
  company: '',
  teamSize: '',
  interest: 'Dedicated implementation',
  message: '',
})
const status = ref('Tell us what you want to roll out.')

async function submitLead() {
  status.value = 'Sending request'
  await api.captureLead({ ...lead.value, sourcePath: window.location.pathname })
  void api.trackEvent({ eventName: 'lead_submit', sourcePath: window.location.pathname, metadata: { interest: lead.value.interest } })
  status.value = 'Request received. We will follow up with the next implementation step.'
  lead.value.message = ''
}

onMounted(() => {
  setSeo({
    title: 'Contact Soteria FORGE | Dedicated LMS rollout',
    description: 'Request a dedicated Soteria FORGE tenant, branded subdomain, implementation support, or custom course rollout.',
    path: '/contact',
  })
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

    <section class="course-detail-hero">
      <div>
        <p class="eyebrow">Dedicated rollout</p>
        <h1>Need a branded tenant, subdomain, or implementation package?</h1>
        <p>Use the marketplace now, then convert to dedicated mode when your company needs branding, custom assignments, and rollout support.</p>
      </div>
      <form class="checkout-panel contact-form" @submit.prevent="submitLead">
        <h2>Request implementation help</h2>
        <input v-model="lead.name" placeholder="Name" required />
        <input v-model="lead.email" placeholder="Email" type="email" required />
        <input v-model="lead.company" placeholder="Company" />
        <input v-model="lead.teamSize" placeholder="Team size" />
        <select v-model="lead.interest">
          <option>Dedicated implementation</option>
          <option>Course bundle subscription</option>
          <option>Custom course creator</option>
          <option>SCORM/xAPI migration</option>
        </select>
        <textarea v-model="lead.message" placeholder="What are you trying to launch?" />
        <button class="button button-primary" type="submit">Send request</button>
        <p>{{ status }}</p>
      </form>
    </section>
  </main>
</template>
