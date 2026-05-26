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
import { safetyForge10HourCourseSeed } from './safetyForge10Hour.js'

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
      headline: 'Start field safety training this month.',
      bestFor: 'Solo learners, owner-operators, and very small teams',
      seatLimit: 3,
      stripePriceId: env.stripePriceStarter,
      priceLabel: env.stripePriceStarter ? 'Monthly subscription' : 'Configure Stripe price',
      displayPriceLabel: 'Monthly access',
      trialLabel: 'Preview course available',
      seatLabel: 'Up to 3 learners',
      ctaLabel: 'Start Starter',
      featured: false,
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
      headline: 'Train crews without locking into annual contracts.',
      bestFor: 'Construction, logistics, utilities, and field service crews',
      seatLimit: 15,
      stripePriceId: env.stripePriceFieldTeam,
      priceLabel: env.stripePriceFieldTeam ? 'Monthly subscription' : 'Configure Stripe price',
      displayPriceLabel: 'Monthly team access',
      trialLabel: 'Coupon-ready checkout',
      seatLabel: 'Up to 15 learners',
      ctaLabel: 'Start Field Team',
      featured: true,
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
      headline: 'Compliance records, certificates, and offline-ready training.',
      bestFor: 'Small companies that need proof of training and manager reports',
      seatLimit: 50,
      stripePriceId: env.stripePriceCompliance,
      priceLabel: env.stripePriceCompliance ? 'Monthly subscription' : 'Configure Stripe price',
      displayPriceLabel: 'Monthly compliance access',
      trialLabel: 'Includes certificate wallet',
      seatLabel: 'Up to 50 learners',
      ctaLabel: 'Start Compliance',
      featured: false,
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
      name: 'Safety FORGE 10 Hour',
      slug: 'safety-forge-10-hour',
      description:
        'OSHA-aligned 10-hour construction safety awareness course shell with videos, quizzes, final assessment, offline supports, and supervisor signoff.',
      headline: 'A field-ready 10-hour construction safety package.',
      bestFor: 'Construction workers, small contractor crews, and jobsite onboarding',
      seatLimit: 10,
      stripePriceId: env.stripePriceSafetyForge10Hour,
      priceLabel: env.stripePriceSafetyForge10Hour ? 'Monthly subscription' : 'Configure Stripe price',
      displayPriceLabel: '10-hour safety access',
      trialLabel: 'OSHA-aligned shell',
      seatLabel: 'Up to 10 learners',
      ctaLabel: 'Start Safety FORGE',
      featured: true,
      buyerType: 'both',
      sortOrder: 25,
      bundleKey: 'safety-forge-10-hour-construction',
      featureFlags: {
        certificates: true,
        offlineMode: true,
        xapi: true,
        topicAuditReport: true,
        supervisorSignoff: true,
        officialDolCard: false,
      },
    },
    {
      name: 'Dedicated Implementation',
      slug: 'dedicated-implementation',
      description: 'Implementation-ready package for branded subdomains, custom rollout support, and tenant-specific course operations.',
      headline: 'Move from marketplace workspace to dedicated rollout.',
      bestFor: 'Organizations needing subdomains, branding, and implementation support',
      seatLimit: 250,
      stripePriceId: env.stripePriceDedicated,
      priceLabel: env.stripePriceDedicated ? 'Monthly subscription' : 'Contact to configure',
      displayPriceLabel: 'Implementation package',
      trialLabel: 'Talk to Soteria FORGE',
      seatLabel: 'Custom rollout seats',
      ctaLabel: 'Request Dedicated',
      featured: false,
      buyerType: 'company',
      sortOrder: 40,
      bundleKey: 'field-readiness-library',
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
  if (demoTenant) {
    await Course.updateMany(
      { tenantId: demoTenant._id, title: 'Field Readiness Orientation' },
      {
        $set: {
          slug: 'field-readiness-orientation',
          publicSummary:
            'A short, mobile-first starter course for crews who need practical safety habits, offline support, and completion records in the field.',
          audience: ['New field employees', 'Contractors', 'Crew leads', 'Owner-operators'],
          outcomes: [
            'Explain how Soteria FORGE supports field-ready training.',
            'Identify the offline workflow for low-connectivity job sites.',
            'Complete a short knowledge check and generate a certificate-ready record.',
          ],
          category: 'Industrial Safety',
          role: 'Field worker',
          topic: 'Field readiness',
          durationMinutes: 15,
          certificateLabel: 'Field Readiness certificate',
          fieldReadinessScore: 88,
        },
      },
    )

    const safetySeed = safetyForge10HourCourseSeed(demoTenant._id)
    const existingSafetyCourse = await Course.findOne({ tenantId: demoTenant._id, slug: 'safety-forge-10-hour' })
    if (existingSafetyCourse) {
      const { modules: _modules, tenantId: _tenantId, ...safetyMetadata } = safetySeed
      await Course.findByIdAndUpdate(existingSafetyCourse._id, { $set: safetyMetadata })
    } else {
      await Course.create(safetySeed)
    }
  }
  const demoCourses = demoTenant ? await Course.find({ tenantId: demoTenant._id, status: 'published' }).sort({ updatedAt: -1 }) : []
  const fieldReadinessCourses = demoCourses.filter((course: any) => course.slug === 'field-readiness-orientation')
  const safetyForgeCourses = demoCourses.filter((course: any) => course.slug === 'safety-forge-10-hour')

  const fieldReadinessBundle = await CourseBundleModel.findOneAndUpdate(
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
        courseIds: fieldReadinessCourses.map((course: any) => course._id),
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const safetyForgeBundle = await CourseBundleModel.findOneAndUpdate(
    { slug: 'safety-forge-10-hour-construction' },
    {
      $setOnInsert: {
        name: 'Safety FORGE 10 Hour Construction',
        slug: 'safety-forge-10-hour-construction',
        description: 'OSHA-aligned construction safety awareness course shell for hybrid field-ready delivery.',
        category: 'Construction Safety',
        status: 'active',
        sortOrder: 20,
      },
      $set: {
        courseIds: safetyForgeCourses.map((course: any) => course._id),
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const bundlesByKey = {
    'field-readiness-library': fieldReadinessBundle,
    'safety-forge-10-hour-construction': safetyForgeBundle,
  }

  for (const seed of defaultPackageSeeds()) {
    const bundleKey = 'bundleKey' in seed ? seed.bundleKey : 'field-readiness-library'
    const bundleIds =
      seed.slug === 'compliance'
        ? [fieldReadinessBundle._id, safetyForgeBundle._id]
        : [bundlesByKey[bundleKey as keyof typeof bundlesByKey]._id]
    await ProductPackageModel.findOneAndUpdate(
      { slug: seed.slug },
      {
        $setOnInsert: {
          slug: seed.slug,
          status: 'active',
        },
        $set: {
          name: seed.name,
          description: seed.description,
          bundleIds,
          seatLimit: seed.seatLimit,
          featureFlags: seed.featureFlags,
          stripePriceId: seed.stripePriceId,
          priceLabel: seed.priceLabel,
          buyerType: seed.buyerType,
          sortOrder: seed.sortOrder,
          headline: seed.headline,
          bestFor: seed.bestFor,
          featured: seed.featured,
          ctaLabel: seed.ctaLabel,
          trialLabel: seed.trialLabel,
          seatLabel: seed.seatLabel,
          displayPriceLabel: seed.displayPriceLabel,
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
          slug: course.slug,
          description: course.description,
          publicSummary: course.publicSummary,
          audience: course.audience,
          outcomes: course.outcomes,
          category: course.category,
          role: course.role,
          topic: course.topic,
          durationMinutes: course.durationMinutes,
          certificateLabel: course.certificateLabel,
          complianceDisclaimers: course.complianceDisclaimers,
          contactHourTargetMinutes: course.contactHourTargetMinutes,
          sequenceLocked: course.sequenceLocked,
          passingScore: course.passingScore,
          attemptLimit: course.attemptLimit,
          languageVariants: course.languageVariants,
          studyGuideAssetId: course.studyGuideAssetId,
          thumbnailUrl: course.thumbnailUrl,
          heroImageUrl: course.heroImageUrl,
          previewLessonId: course.previewLessonId,
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
          primaryColor: '#3DA9FC',
          accentColor: '#FF6B1F',
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
