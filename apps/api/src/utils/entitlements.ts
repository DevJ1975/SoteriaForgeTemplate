import type { Request } from 'express'
import { EntitlementModel, UserModel } from '../models/index.js'

export async function accessibleCourseFilter(req: Request) {
  if (req.tenant?.mode !== 'marketplace') return {}
  if (req.tenant.billingStatus === 'canceled') return { _id: { $in: [] } }

  const entitlements = await EntitlementModel.find({ tenantId: req.tenant?.mongoId })
  const courseIds = entitlements.flatMap((entitlement) => entitlement.courseIds)
  return { _id: { $in: courseIds } }
}

export async function enforceSeatLimit(req: Request, additionalSeats = 1) {
  if (req.tenant?.mode !== 'marketplace') return

  const seatLimit = req.tenant.seatLimit ?? 1
  const currentSeats = await UserModel.countDocuments({ tenantId: req.tenant.mongoId, roles: 'learner' })
  if (currentSeats + additionalSeats > seatLimit) {
    const error = new Error(`Seat limit exceeded. This package includes ${seatLimit} learner seat${seatLimit === 1 ? '' : 's'}.`)
    error.name = 'SeatLimitError'
    throw error
  }
}
