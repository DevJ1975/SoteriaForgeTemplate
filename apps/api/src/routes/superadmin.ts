import { Router } from 'express'
import { normalizeTenantSlug } from '@soteria-forge/shared'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { TenantModel } from '../models/index.js'
import { serializeTenant } from '../utils/serialize.js'

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
        primaryColor: req.body.branding?.primaryColor ?? '#1f3f86',
        accentColor: req.body.branding?.accentColor ?? '#c9a84e',
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
