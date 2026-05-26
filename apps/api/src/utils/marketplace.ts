import bcrypt from 'bcryptjs'
import {
  isEmailLike,
  normalizeTenantSlug,
  requireStringField,
  type CheckoutSessionInput,
} from '@soteria-forge/shared'
import { env } from '../config/env.js'
import {
  CourseBundleModel,
  CourseModel,
  EnrollmentModel,
  EntitlementModel,
  ProductPackageModel,
  SubscriptionModel,
  TenantModel,
  UserModel,
} from '../models/index.js'

const defaultPassword = 'SoteriaForgeDemo!2026'
const Course: any = CourseModel
const Enrollment: any = EnrollmentModel
const Entitlement: any = EntitlementModel
const Subscription: any = SubscriptionModel
const Tenant: any = TenantModel
const User: any = UserModel

export function defaultPackageSeeds() {
  return [
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Affordable monthly access for solo learners and very small teams getting started with field-ready training.',
      seatLimit: 3,
      stripePriceId: env.stripePriceStarter,
      priceLabel: env.stripePriceStarter ? 'Monthly subscription' : 'Configure Stripe price',
      buyerType: 'both',
      sortOrder: 10,
      featureFlags: {
        certificates: true,
        offlineMode: true,
        managerReports: false,
        dedicatedSubdomain: false,
      },
    },
    {
      name: 'Field Team',
      slug: 'field-team',
      description: 'Monthly access for crews that need mobile assignments, offline support, and supervisor visibility.',
      seatLimit: 15,
      stripePriceId: env.stripePriceFieldTeam,
      priceLabel: env.stripePriceFieldTeam ? 'Monthly subscription' : 'Configure Stripe price',
      buyerType: 'company',
      sortOrder: 20,
      featureFlags: {
        certificates: true,
        offlineMode: true,
        managerReports: true,
        dedicatedSubdomain: false,
      },
    },
    {
      name: 'Compliance',
      slug: 'compliance',
      description: 'Full monthly compliance package with reports, certificates, offline field mode, and audit-ready records.',
      seatLimit: 50,
      stripePriceId: env.stripePriceCompliance,
      priceLabel: env.stripePriceCompliance ? 'Monthly subscription' : 'Configure Stripe price',
      buyerType: 'company',
      sortOrder: 30,
      featureFlags: {
        certificates: true,
        offlineMode: true,
        managerReports: true,
        auditExports: true,
        dedicatedSubdomain: false,
      },
    },
    {
      name: 'Dedicated Implementation',
      slug: 'dedicated-implementation',
      description: 'Implementation-ready package for branded subdomains, custom rollout support, and tenant-specific course operations.',
      seatLimit: 250,
      stripePriceId: env.stripePriceDedicated,
      priceLabel: env.stripePriceDedicated ? 'Monthly subscription' : 'Contact to configure',
      buyerType: 'company',
      sortOrder: 40,
      featureFlags: {
        certificates: true,
        offlineMode: true,
        managerReports: true,
        auditExports: true,
        dedicatedSubdomain: true,
        customBranding: true,
      },
    },
  ] as const
}

export async function ensureMarketplaceCatalog() {
  const demoTenant = await Tenant.findOne({ slug: 'demo' })
  const demoCourses = demoTenant ? await Course.find({ tenantId: demoTenant._id, status: 'published' }).sort({ updatedAt: -1 }) : []

  const bundle = await CourseBundleModel.findOneAndUpdate(
    { slug: 'field-readiness-library' },
    {
      $setOnInsert: {
        name: 'Field Readiness Library',
        slug: 'field-readiness-library',
        description: 'Mobile-first safety, compliance, and field readiness lessons for small teams.',
        category: 'Industrial Safety',
        status: 'active',
        sortOrder: 10,
      },
      $set: {
        courseIds: demoCourses.map((course: any) => course._id),
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  for (const seed of defaultPackageSeeds()) {
    await ProductPackageModel.findOneAndUpdate(
      { slug: seed.slug },
      {
        $setOnInsert: {
          name: seed.name,
          slug: seed.slug,
          description: seed.description,
          status: 'active',
          buyerType: seed.buyerType,
          sortOrder: seed.sortOrder,
        },
        $set: {
          bundleIds: [bundle._id],
          seatLimit: seed.seatLimit,
          featureFlags: seed.featureFlags,
          stripePriceId: seed.stripePriceId,
          priceLabel: seed.priceLabel,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
  }
}

export async function cloneBundleCoursesToTenant(packageId: unknown, tenantId: unknown) {
  const productPackage = await ProductPackageModel.findById(packageId)
  if (!productPackage) throw new Error('Package not found')

  const bundles = await CourseBundleModel.find({ _id: { $in: productPackage.bundleIds }, status: 'active' })
  const sourceCourseIds = bundles.flatMap((bundle) => bundle.courseIds)
  const sourceCourses = await Course.find({ _id: { $in: sourceCourseIds }, status: 'published' })
  const clonedCourseIds = []

  for (const course of sourceCourses) {
    const cloned = await Course.findOneAndUpdate(
      { tenantId, title: course.title },
      {
        $setOnInsert: {
          tenantId,
          title: course.title,
          description: course.description,
          status: 'published',
          tags: course.tags,
          fieldReadinessScore: course.fieldReadinessScore,
          certificateExpiresInDays: course.certificateExpiresInDays,
          modules: course.modules,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
    clonedCourseIds.push(cloned._id)
  }

  return { productPackage, courseIds: clonedCourseIds }
}

export async function applyEntitlement(input: {
  tenantId: unknown
  buyerUserId: unknown
  packageId: unknown
  source: 'stripe' | 'manual' | 'trial' | 'demo'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  status?: string
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
}) {
  const { productPackage, courseIds } = await cloneBundleCoursesToTenant(input.packageId, input.tenantId)

  const entitlement = await Entitlement.findOneAndUpdate(
    { tenantId: input.tenantId, packageId: input.packageId },
    {
      $set: {
        tenantId: input.tenantId,
        packageId: input.packageId,
        courseIds,
        seatLimit: productPackage.seatLimit,
        features: productPackage.featureFlags,
        source: input.source,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const subscription = await Subscription.findOneAndUpdate(
    { tenantId: input.tenantId, packageId: input.packageId },
    {
      $set: {
        tenantId: input.tenantId,
        buyerUserId: input.buyerUserId,
        packageId: input.packageId,
        status: input.status ?? (input.source === 'manual' ? 'active' : 'incomplete'),
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  await Tenant.findByIdAndUpdate(input.tenantId, {
    $set: {
      billingStatus: input.source === 'manual' ? 'manual' : input.status ?? 'active',
      seatLimit: productPackage.seatLimit,
    },
  })

  for (const courseId of courseIds) {
    await Enrollment.findOneAndUpdate(
      { tenantId: input.tenantId, userId: input.buyerUserId, courseId },
      { $setOnInsert: { tenantId: input.tenantId, userId: input.buyerUserId, courseId, status: 'assigned', progress: 0 } },
      { upsert: true, returnDocument: 'after' },
    )
  }

  return { entitlement, subscription, courseIds }
}

export async function createMarketplaceTenantAndBuyer(payload: CheckoutSessionInput & { packageId: unknown }) {
  const buyerEmail = requireStringField(payload as Record<string, unknown>, 'buyerEmail').toLowerCase()
  const buyerName = requireStringField(payload as Record<string, unknown>, 'buyerName')
  if (!isEmailLike(buyerEmail)) throw new Error('A valid buyer email is required')

  const tenantBaseName = payload.buyerType === 'company' ? payload.companyName || buyerName : buyerName
  const slugBase = normalizeTenantSlug(`${tenantBaseName}-${buyerEmail.split('@')[0]}`)
  const slug = `${slugBase}`.slice(0, 48) || `marketplace-${Date.now()}`

  const productPackage = await ProductPackageModel.findById(payload.packageId)
  if (!productPackage) throw new Error('Package not found')

  const tenant = await Tenant.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        name: payload.buyerType === 'company' ? payload.companyName || `${buyerName} Workspace` : `${buyerName} Workspace`,
        slug,
        domains: [],
        status: 'trial',
        mode: 'marketplace',
        billingStatus: 'none',
        seatLimit: productPackage.seatLimit,
        branding: {
          appName: payload.buyerType === 'company' ? payload.companyName || 'Soteria Forge' : 'Soteria Forge',
          primaryColor: '#1f3f86',
          accentColor: '#c9a84e',
        },
        settings: {
          offlineEnabled: true,
          lowBandwidthMode: true,
          vimeoDomainPrivacyRequired: true,
          defaultCertificateExpiryDays: 365,
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const passwordHash = await bcrypt.hash(defaultPassword, 12)
  const user = await User.findOneAndUpdate(
    { tenantId: tenant._id, email: buyerEmail },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        email: buyerEmail,
        passwordHash,
        invitedAt: new Date(),
      },
      $set: {
        name: buyerName,
        roles: ['learner', 'admin'],
        jobTitle: payload.buyerType === 'company' ? 'Company Admin' : 'Individual Learner',
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  return { tenant, user, productPackage, temporaryPassword: defaultPassword }
}
