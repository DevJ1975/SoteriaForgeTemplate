import type {
  CertificateDTO,
  CompletionDTO,
  CourseBundleDTO,
  CourseDTO,
  EntitlementDTO,
  EnrollmentDTO,
  MarketplaceOrderDTO,
  ProductPackageDTO,
  ScormRuntimeDTO,
  SubscriptionDTO,
  TenantDTO,
  UserDTO,
  UserRole,
} from '@soteria-forge/shared'

export function serializeTenant(tenant: any): TenantDTO {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    domains: tenant.domains ?? [],
    status: tenant.status,
    mode: tenant.mode ?? 'dedicated',
    billingStatus: tenant.billingStatus ?? 'none',
    seatLimit: tenant.seatLimit,
    marketplaceOriginTenantId: tenant.marketplaceOriginTenantId?.toString(),
    dedicatedSubdomain: tenant.dedicatedSubdomain,
    branding: tenant.branding,
    settings: tenant.settings,
  }
}

function mapToObject(value: any) {
  if (!value) return {}
  if (value instanceof Map) return Object.fromEntries(value.entries())
  return value
}

export function serializeCourseBundle(bundle: any): CourseBundleDTO {
  return {
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    description: bundle.description ?? '',
    category: bundle.category ?? 'Field Training',
    status: bundle.status,
    courseIds: (bundle.courseIds ?? []).map((id: any) => id.toString()),
    sortOrder: bundle.sortOrder ?? 100,
  }
}

export function serializeProductPackage(productPackage: any): ProductPackageDTO {
  return {
    id: productPackage.id,
    name: productPackage.name,
    slug: productPackage.slug,
    description: productPackage.description ?? '',
    status: productPackage.status,
    bundleIds: (productPackage.bundleIds ?? []).map((id: any) => id.toString()),
    seatLimit: productPackage.seatLimit ?? 1,
    featureFlags: mapToObject(productPackage.featureFlags),
    stripeProductId: productPackage.stripeProductId,
    stripePriceId: productPackage.stripePriceId,
    priceLabel: productPackage.priceLabel,
    buyerType: productPackage.buyerType ?? 'both',
    sortOrder: productPackage.sortOrder ?? 100,
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

export function serializeEnrollment(enrollment: any): EnrollmentDTO {
  return {
    id: enrollment.id,
    tenantId: enrollment.tenantId.toString(),
    userId: enrollment.userId.toString(),
    courseId: enrollment.courseId.toString(),
    status: enrollment.status,
    dueAt: enrollment.dueAt?.toISOString?.(),
    completedAt: enrollment.completedAt?.toISOString?.(),
    progress: enrollment.progress ?? 0,
  }
}

export function serializeCompletion(completion: any): CompletionDTO {
  return {
    id: completion.id,
    tenantId: completion.tenantId.toString(),
    userId: completion.userId.toString(),
    courseId: completion.courseId.toString(),
    lessonId: completion.lessonId,
    completedAt: completion.completedAt?.toISOString?.() ?? new Date().toISOString(),
    source: completion.source ?? 'online',
  }
}

export function serializeCertificate(certificate: any): CertificateDTO {
  return {
    id: certificate.id,
    tenantId: certificate.tenantId.toString(),
    userId: certificate.userId.toString(),
    courseId: certificate.courseId.toString(),
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt?.toISOString?.() ?? new Date().toISOString(),
    expiresAt: certificate.expiresAt?.toISOString?.(),
    revokedAt: certificate.revokedAt?.toISOString?.(),
  }
}

export function serializeSubscription(subscription: any): SubscriptionDTO {
  return {
    id: subscription.id,
    tenantId: subscription.tenantId.toString(),
    buyerUserId: subscription.buyerUserId.toString(),
    packageId: subscription.packageId.toString(),
    status: subscription.status,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString?.(),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
  }
}

export function serializeEntitlement(entitlement: any): EntitlementDTO {
  return {
    id: entitlement.id,
    tenantId: entitlement.tenantId.toString(),
    packageId: entitlement.packageId.toString(),
    courseIds: (entitlement.courseIds ?? []).map((id: any) => id.toString()),
    seatLimit: entitlement.seatLimit ?? 1,
    features: mapToObject(entitlement.features),
    source: entitlement.source ?? 'stripe',
  }
}

export function serializeMarketplaceOrder(order: any): MarketplaceOrderDTO {
  return {
    id: order.id,
    tenantId: order.tenantId?.toString(),
    packageId: order.packageId.toString(),
    buyerEmail: order.buyerEmail,
    buyerName: order.buyerName,
    buyerType: order.buyerType,
    companyName: order.companyName,
    seatCount: order.seatCount ?? 1,
    status: order.status,
    stripeCheckoutSessionId: order.stripeCheckoutSessionId,
  }
}

export function serializeScormRuntime(runtime: any): ScormRuntimeDTO {
  return {
    id: runtime.id,
    tenantId: runtime.tenantId.toString(),
    attemptId: runtime.attemptId.toString(),
    packageId: runtime.packageId.toString(),
    version: runtime.version,
    lessonStatus: runtime.lessonStatus,
    completionStatus: runtime.completionStatus,
    successStatus: runtime.successStatus,
    scoreRaw: runtime.scoreRaw,
    scoreMin: runtime.scoreMin,
    scoreMax: runtime.scoreMax,
    suspendData: runtime.suspendData,
    location: runtime.location,
    sessionTime: runtime.sessionTime,
    totalTime: runtime.totalTime,
    interactions: runtime.interactions ?? [],
    updatedAt: runtime.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }
}
