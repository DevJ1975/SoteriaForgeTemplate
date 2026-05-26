import type { Request } from 'express'

export function requireTenant(req: Request) {
  if (!req.tenant?.mongoId) {
    throw new Error('Tenant context is required')
  }

  return req.tenant.mongoId
}

export function tenantQuery(req: Request, extra: Record<string, unknown> = {}) {
  return {
    tenantId: requireTenant(req),
    ...extra,
  }
}
