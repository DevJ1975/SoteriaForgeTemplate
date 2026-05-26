import { Router } from 'express'
import { normalizeTenantSlug } from '@soteria-forge/shared'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { TenantModel } from '../models/index.js'
import { serializeTenant } from '../utils/serialize.js'

export const superadminRouter = Router()

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
