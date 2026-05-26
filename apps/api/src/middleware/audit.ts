import type { NextFunction, Request, Response } from 'express'
import { AuditEventModel } from '../models/index.js'

export function auditAction(action: string, resourceType?: string) {
  return (req: Request, _: Response, next: NextFunction) => {
    req.audit = { action, resourceType }
    next()
  }
}

export function auditResponse(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (!req.audit || res.statusCode >= 400) return

    void AuditEventModel.create({
      tenantId: req.tenant?.mongoId,
      actorUserId: req.user?.mongoId,
      action: req.audit.action,
      resourceType: req.audit.resourceType,
      resourceId: req.audit.resourceId,
      metadata: req.audit.metadata,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    }).catch(() => {
      // Audit logging must not break the primary request after the response is sent.
    })
  })

  next()
}
