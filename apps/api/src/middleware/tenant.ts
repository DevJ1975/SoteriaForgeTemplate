import type { NextFunction, Request, Response } from 'express'
import { resolveTenantSlugFromHost } from '@soteria-forge/shared'
import { env } from '../config/env.js'
import { TenantModel } from '../models/index.js'

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const explicitSlug = req.header('x-soteria-tenant')
  const hostSlug = resolveTenantSlugFromHost(req.headers.host, env.rootDomain)
  const slug = explicitSlug ?? hostSlug
  const tenant = await TenantModel.findOne({ slug, status: { $ne: 'archived' } })

  if (!tenant) {
    res.status(404).json({ error: `Tenant not found for slug ${slug}` })
    return
  }

  req.tenant = {
    id: tenant.id,
    mongoId: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
    domains: tenant.domains,
    status: tenant.status,
    mode: tenant.mode ?? 'dedicated',
    billingStatus: tenant.billingStatus ?? 'none',
    seatLimit: tenant.seatLimit ?? undefined,
    marketplaceOriginTenantId: tenant.marketplaceOriginTenantId?.toString(),
    dedicatedSubdomain: tenant.dedicatedSubdomain ?? undefined,
    branding: {
      appName: tenant.branding.appName,
      logoUrl: tenant.branding.logoUrl ?? undefined,
      primaryColor: tenant.branding.primaryColor,
      accentColor: tenant.branding.accentColor,
    },
    settings: {
      offlineEnabled: tenant.settings.offlineEnabled,
      lowBandwidthMode: tenant.settings.lowBandwidthMode,
      vimeoDomainPrivacyRequired: tenant.settings.vimeoDomainPrivacyRequired,
      defaultCertificateExpiryDays: tenant.settings.defaultCertificateExpiryDays ?? undefined,
    },
  }

  next()
}
