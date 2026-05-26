import type { AuthSessionDTO, CourseDTO, TenantDTO } from '@soteria-forge/shared'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

async function request<T>(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('soteria-forge-console:token')
  const tenantSlug = localStorage.getItem('soteria-forge-console:tenantSlug') ?? 'demo'
  const headers = new Headers(options.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-soteria-tenant', tenantSlug)

  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(payload.error ?? response.statusText)
  }

  return response.json() as Promise<T>
}

export const consoleApi = {
  async login(email: string, password: string, tenantSlug = 'demo') {
    const session = await request<AuthSessionDTO>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    })
    localStorage.setItem('soteria-forge-console:token', session.token)
    localStorage.setItem('soteria-forge-console:tenantSlug', session.tenant.slug)
    return session
  },
  tenants() {
    return request<{ tenants: TenantDTO[] }>('/api/superadmin/tenants')
  },
  createTenant(payload: Partial<TenantDTO> & { name: string; slug: string }) {
    return request<{ tenant: TenantDTO }>('/api/superadmin/tenants', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateTenant(id: string, payload: Partial<TenantDTO>) {
    return request<{ tenant: TenantDTO }>(`/api/superadmin/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  createCourse(payload: Partial<CourseDTO>) {
    return request<{ course: CourseDTO }>('/api/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  publishCourse(id: string) {
    return request<{ course: CourseDTO }>(`/api/courses/${id}/publish`, {
      method: 'POST',
    })
  },
}
