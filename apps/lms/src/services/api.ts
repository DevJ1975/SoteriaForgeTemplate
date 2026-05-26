import type {
  AdminReportDTO,
  AssignCourseInput,
  AuthSessionDTO,
  CertificateDTO,
  CourseDTO,
  CreateUserInput,
  EnrollmentDTO,
  ImportUsersInput,
  SyncRequest,
  SyncResponse,
  TenantDTO,
  UserDTO,
  XapiStatement,
} from '@soteria-forge/shared'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

async function request<T>(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('soteria-forge:token')
  const headers = new Headers(options.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-soteria-tenant', localStorage.getItem('soteria-forge:tenantSlug') ?? 'demo')

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

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  login(email: string, password: string, tenantSlug = 'demo') {
    return request<AuthSessionDTO>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    })
  },
  logout() {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },
  me() {
    return request<AuthSessionDTO>('/api/me')
  },
  tenant() {
    return request<{ tenant: TenantDTO }>('/api/tenant')
  },
  courses() {
    return request<{ courses: CourseDTO[]; enrollments: EnrollmentDTO[] }>('/api/courses')
  },
  course(id: string) {
    return request<{ course: CourseDTO }>(`/api/courses/${id}`)
  },
  completeLesson(payload: Record<string, unknown>) {
    return request('/api/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  submitAttempt(payload: Record<string, unknown>) {
    return request('/api/attempts', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  submitXapiStatement(statement: XapiStatement) {
    return request('/xapi/statements', {
      method: 'POST',
      body: JSON.stringify(statement),
    })
  },
  sync(payload: SyncRequest) {
    return request<SyncResponse>('/api/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  adminCompletionReport() {
    return request<AdminReportDTO>('/api/admin/reports/completions')
  },
  adminUsers() {
    return request<{ users: UserDTO[] }>('/api/admin/users')
  },
  adminCreateUser(payload: CreateUserInput) {
    return request<{ user: UserDTO; temporaryPassword?: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  adminImportUsers(payload: ImportUsersInput) {
    return request<{ imported: UserDTO[]; rejected: Array<{ email?: string; reason: string }>; temporaryPassword: string }>(
      '/api/admin/users/import',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },
  adminEnrollments() {
    return request<{ enrollments: EnrollmentDTO[] }>('/api/admin/enrollments')
  },
  adminAssignCourse(payload: AssignCourseInput) {
    return request<{ assignments: EnrollmentDTO[] }>('/api/admin/assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  adminCertificates() {
    return request<{ certificates: CertificateDTO[] }>('/api/admin/certificates')
  },
}
