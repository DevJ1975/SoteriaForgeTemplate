import { Router } from 'express'
import { normalizeTenantSlug } from '@soteria-forge/shared'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { CourseBundleModel, EntitlementModel, ProductPackageModel, SubscriptionModel, TenantModel } from '../models/index.js'
import {
  serializeCourseBundle,
  serializeEntitlement,
  serializeProductPackage,
  serializeSubscription,
  serializeTenant,
} from '../utils/serialize.js'

export const superadminRouter = Router()

superadminRouter.get(
  '/tenants',
  requireAuth,
  requireRoles('superadmin'),
  asyncHandler(async (_, res) => {
    const tenants = await TenantModel.find({ status: { $ne: 'archived' } }).sort({ name: 1 })
    res.json({ tenants: tenants.map(serializeTenant) })
  }),
)

superadminRouter.get(
  '/tenants/:id',
  requireAuth,
  requireRoles('superadmin'),
  asyncHandler(async (req, res) => {
    const tenant = await TenantModel.findOne({ _id: req.params.id, status: { $ne: 'archived' } })

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    res.json({ tenant: serializeTenant(tenant) })
  }),
)

superadminRouter.post(
  '/tenants',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('tenant.create', 'Tenant'),
  asyncHandler(async (req, res) => {
    const slug = normalizeTenantSlug(req.body.slug ?? req.body.name)
    const tenant = await TenantModel.create({
      name: req.body.name,
      slug,
      domains: req.body.domains ?? [],
      status: req.body.status ?? 'trial',
      branding: {
        appName: req.body.branding?.appName ?? req.body.name,
        logoUrl: req.body.branding?.logoUrl,
        primaryColor: req.body.branding?.primaryColor ?? '#3DA9FC',
        accentColor: req.body.branding?.accentColor ?? '#FF6B1F',
      },
      settings: {
        offlineEnabled: req.body.settings?.offlineEnabled ?? true,
        lowBandwidthMode: req.body.settings?.lowBandwidthMode ?? true,
        vimeoDomainPrivacyRequired: req.body.settings?.vimeoDomainPrivacyRequired ?? true,
        defaultCertificateExpiryDays: req.body.settings?.defaultCertificateExpiryDays ?? 365,
      },
    })

    req.audit = { action: 'tenant.create', resourceType: 'Tenant', resourceId: tenant.id }
    res.status(201).json({ tenant: serializeTenant(tenant) })
  }),
)

superadminRouter.patch(
  '/tenants/:id',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('tenant.update', 'Tenant'),
  asyncHandler(async (req, res) => {
    const tenant = await TenantModel.findOneAndUpdate(
      { _id: req.params.id },
      {
        $set: {
          name: req.body.name,
          slug: req.body.slug ? normalizeTenantSlug(req.body.slug) : undefined,
          domains: req.body.domains,
          status: req.body.status,
          branding: req.body.branding,
          settings: req.body.settings,
        },
      },
      { returnDocument: 'after' },
    )

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    req.audit = { action: 'tenant.update', resourceType: 'Tenant', resourceId: tenant.id }
    res.json({ tenant: serializeTenant(tenant) })
  }),
)

superadminRouter.post(
  '/packages',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('package.create', 'ProductPackage'),
  asyncHandler(async (req, res) => {
    const productPackage = await ProductPackageModel.create({
      name: req.body.name,
      slug: normalizeTenantSlug(req.body.slug ?? req.body.name),
      description: req.body.description ?? '',
      status: req.body.status ?? 'draft',
      bundleIds: req.body.bundleIds ?? [],
      seatLimit: req.body.seatLimit ?? 1,
      featureFlags: req.body.featureFlags ?? {},
      stripeProductId: req.body.stripeProductId,
      stripePriceId: req.body.stripePriceId,
      priceLabel: req.body.priceLabel,
      headline: req.body.headline,
      bestFor: req.body.bestFor,
      featured: req.body.featured ?? false,
      ctaLabel: req.body.ctaLabel,
      trialLabel: req.body.trialLabel,
      seatLabel: req.body.seatLabel,
      displayPriceLabel: req.body.displayPriceLabel,
      buyerType: req.body.buyerType ?? 'both',
      sortOrder: req.body.sortOrder ?? 100,
    })

    req.audit = { action: 'package.create', resourceType: 'ProductPackage', resourceId: productPackage.id }
    res.status(201).json({ package: serializeProductPackage(productPackage) })
  }),
)

superadminRouter.patch(
  '/packages/:id',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('package.update', 'ProductPackage'),
  asyncHandler(async (req, res) => {
    const productPackage = await ProductPackageModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: req.body.name,
          slug: req.body.slug ? normalizeTenantSlug(req.body.slug) : undefined,
          description: req.body.description,
          status: req.body.status,
          bundleIds: req.body.bundleIds,
          seatLimit: req.body.seatLimit,
          featureFlags: req.body.featureFlags,
          stripeProductId: req.body.stripeProductId,
          stripePriceId: req.body.stripePriceId,
          priceLabel: req.body.priceLabel,
          headline: req.body.headline,
          bestFor: req.body.bestFor,
          featured: req.body.featured,
          ctaLabel: req.body.ctaLabel,
          trialLabel: req.body.trialLabel,
          seatLabel: req.body.seatLabel,
          displayPriceLabel: req.body.displayPriceLabel,
          buyerType: req.body.buyerType,
          sortOrder: req.body.sortOrder,
        },
      },
      { returnDocument: 'after' },
    )

    if (!productPackage) {
      res.status(404).json({ error: 'Package not found' })
      return
    }

    req.audit = { action: 'package.update', resourceType: 'ProductPackage', resourceId: productPackage.id }
    res.json({ package: serializeProductPackage(productPackage) })
  }),
)

superadminRouter.post(
  '/course-bundles',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('courseBundle.create', 'CourseBundle'),
  asyncHandler(async (req, res) => {
    const bundle = await CourseBundleModel.create({
      name: req.body.name,
      slug: normalizeTenantSlug(req.body.slug ?? req.body.name),
      description: req.body.description ?? '',
      category: req.body.category ?? 'Field Training',
      status: req.body.status ?? 'draft',
      courseIds: req.body.courseIds ?? [],
      sortOrder: req.body.sortOrder ?? 100,
    })

    req.audit = { action: 'courseBundle.create', resourceType: 'CourseBundle', resourceId: bundle.id }
    res.status(201).json({ bundle: serializeCourseBundle(bundle) })
  }),
)

superadminRouter.patch(
  '/course-bundles/:id',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('courseBundle.update', 'CourseBundle'),
  asyncHandler(async (req, res) => {
    const bundle = await CourseBundleModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: req.body.name,
          slug: req.body.slug ? normalizeTenantSlug(req.body.slug) : undefined,
          description: req.body.description,
          category: req.body.category,
          status: req.body.status,
          courseIds: req.body.courseIds,
          sortOrder: req.body.sortOrder,
        },
      },
      { returnDocument: 'after' },
    )

    if (!bundle) {
      res.status(404).json({ error: 'Course bundle not found' })
      return
    }

    req.audit = { action: 'courseBundle.update', resourceType: 'CourseBundle', resourceId: bundle.id }
    res.json({ bundle: serializeCourseBundle(bundle) })
  }),
)

superadminRouter.post(
  '/tenants/:id/convert-to-dedicated',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('tenant.convertToDedicated', 'Tenant'),
  asyncHandler(async (req, res) => {
    const subdomain = normalizeTenantSlug(req.body.subdomain ?? req.body.dedicatedSubdomain ?? '')
    const tenant = await TenantModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          mode: 'dedicated',
          billingStatus: req.body.billingStatus ?? 'manual',
          dedicatedSubdomain: subdomain || undefined,
          domains: subdomain ? [`${subdomain}.soteriaforge.com`, ...(req.body.domains ?? [])] : req.body.domains,
          branding: req.body.branding,
          settings: req.body.settings,
        },
      },
      { returnDocument: 'after' },
    )

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    req.audit = { action: 'tenant.convertToDedicated', resourceType: 'Tenant', resourceId: tenant.id }
    res.json({ tenant: serializeTenant(tenant) })
  }),
)

superadminRouter.patch(
  '/tenants/:id/billing-override',
  requireAuth,
  requireRoles('superadmin'),
  auditAction('tenant.billingOverride', 'Tenant'),
  asyncHandler(async (req, res) => {
    const tenant = await TenantModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          billingStatus: req.body.billingStatus ?? 'manual',
          seatLimit: req.body.seatLimit,
        },
      },
      { returnDocument: 'after' },
    )

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    let subscription = null
    let entitlement = null
    if (req.body.subscriptionId) {
      subscription = await SubscriptionModel.findById(req.body.subscriptionId)
    }
    if (req.body.entitlementId) {
      entitlement = await EntitlementModel.findById(req.body.entitlementId)
    }

    req.audit = { action: 'tenant.billingOverride', resourceType: 'Tenant', resourceId: tenant.id }
    res.json({
      tenant: serializeTenant(tenant),
      subscription: subscription ? serializeSubscription(subscription) : null,
      entitlement: entitlement ? serializeEntitlement(entitlement) : null,
    })
  }),
)
