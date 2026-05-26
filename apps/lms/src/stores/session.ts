import { defineStore } from 'pinia'
import type { TenantDTO, UserDTO } from '@soteria-forge/shared'
import { api } from '../services/api'

type SessionState = {
  token: string
  user: UserDTO | null
  tenant: TenantDTO | null
  apiStatus: 'idle' | 'loading' | 'ready' | 'offline-demo' | 'error'
  error: string
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    token: localStorage.getItem('soteria-forge:token') ?? '',
    user: null,
    tenant: null,
    apiStatus: 'idle',
    error: '',
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user || state.token),
    roles: (state) => state.user?.roles ?? ['learner'],
  },
  actions: {
    async login(email: string, password: string, tenantSlug = 'demo') {
      this.apiStatus = 'loading'
      this.error = ''

      try {
        const session = await api.login(email, password, tenantSlug)
        this.token = session.token
        this.user = session.user
        this.tenant = session.tenant
        this.apiStatus = 'ready'
        localStorage.setItem('soteria-forge:token', session.token)
        localStorage.setItem('soteria-forge:tenantSlug', session.tenant.slug)
        localStorage.setItem('soteria-forge:name', session.user.name)
        return session
      } catch (error) {
        this.apiStatus = 'offline-demo'
        this.error = error instanceof Error ? error.message : 'Unable to reach API'
        this.user = {
          id: 'offline-demo-user',
          tenantId: 'offline-demo',
          email,
          name: localStorage.getItem('soteria-forge:name') ?? 'Jordan Lee',
          roles: ['learner', 'admin'],
          jobTitle: 'Offline demo user',
          department: 'Field Team',
        }
        this.tenant = {
          id: 'offline-demo',
          name: 'Soteria Forge Demo',
          slug: 'demo',
          domains: [],
          status: 'trial',
          mode: 'dedicated',
          billingStatus: 'manual',
          branding: {
            appName: 'Soteria Forge',
            primaryColor: '#1f3f86',
            accentColor: '#c9a84e',
          },
          settings: {
            offlineEnabled: true,
            lowBandwidthMode: true,
            vimeoDomainPrivacyRequired: true,
          },
        }
        return null
      }
    },
    async restore() {
      if (!this.token) return
      try {
        const session = await api.me()
        this.user = session.user
        this.tenant = session.tenant
        this.apiStatus = 'ready'
      } catch {
        this.apiStatus = 'offline-demo'
      }
    },
    async logout() {
      await api.logout().catch(() => undefined)
      this.token = ''
      this.user = null
      this.tenant = null
      localStorage.removeItem('soteria-forge:token')
      localStorage.removeItem('soteria-forge:name')
    },
  },
})
