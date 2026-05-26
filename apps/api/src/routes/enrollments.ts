import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { EnrollmentModel } from '../models/index.js'

export const enrollmentsRouter = Router()

enrollmentsRouter.post(
  '/',
  requireAuth,
  requireRoles('admin', 'manager', 'superadmin'),
  auditAction('enrollment.assign', 'Enrollment'),
  asyncHandler(async (req, res) => {
    const enrollment = await EnrollmentModel.findOneAndUpdate(
      {
        tenantId: req.tenant?.mongoId,
        userId: req.body.userId,
        courseId: req.body.courseId,
      },
      {
        $set: {
          tenantId: req.tenant?.mongoId,
          userId: req.body.userId,
          courseId: req.body.courseId,
          status: req.body.status ?? 'assigned',
          dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
        },
      },
      { upsert: true, new: true },
    )

    req.audit = { action: 'enrollment.assign', resourceType: 'Enrollment', resourceId: enrollment.id }
    res.status(201).json({ enrollment })
  }),
)
