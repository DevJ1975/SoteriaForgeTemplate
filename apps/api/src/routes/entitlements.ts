import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { EntitlementModel } from '../models/index.js'
import { serializeEntitlement } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const entitlementsRouter = Router()

entitlementsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const entitlements = await EntitlementModel.find(tenantQuery(req)).sort({ updatedAt: -1 })
    res.json({ entitlements: entitlements.map(serializeEntitlement) })
  }),
)
