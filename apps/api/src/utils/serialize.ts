import type { CourseDTO, TenantDTO, UserDTO, UserRole } from '@soteria-forge/shared'

export function serializeTenant(tenant: any): TenantDTO {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    domains: tenant.domains ?? [],
    status: tenant.status,
    branding: tenant.branding,
    settings: tenant.settings,
  }
}

export function serializeUser(user: any): UserDTO {
  return {
    id: user.id,
    tenantId: user.tenantId.toString(),
    email: user.email,
    name: user.name,
    roles: user.roles as UserRole[],
    jobTitle: user.jobTitle,
    department: user.department,
    crew: user.crew,
    site: user.site,
  }
}

export function serializeCourse(course: any): CourseDTO {
  return {
    id: course.id,
    tenantId: course.tenantId.toString(),
    title: course.title,
    description: course.description,
    status: course.status,
    tags: course.tags ?? [],
    fieldReadinessScore: course.fieldReadinessScore ?? 0,
    certificateExpiresInDays: course.certificateExpiresInDays,
    modules: (course.modules ?? []).map((module: any) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      lessons: (module.lessons ?? []).map((lesson: any) => ({
        id: lesson.id,
        kind: lesson.kind,
        title: lesson.title,
        description: lesson.description,
        durationMinutes: lesson.durationMinutes,
        required: lesson.required,
        vimeoUrl: lesson.vimeoUrl,
        assetId: lesson.assetId?.toString(),
        quizQuestions: lesson.quizQuestions ?? [],
        transcript: lesson.transcript,
        offlineSummary: lesson.offlineSummary,
      })),
    })),
    updatedAt: course.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }
}
