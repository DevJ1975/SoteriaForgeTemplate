import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { CompletionModel, CourseModel, EnrollmentModel, UserModel, XapiStatementModel } from '../models/index.js'

export const adminRouter = Router()

adminRouter.get(
  '/reports/completions',
  requireAuth,
  requireRoles('manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const [users, courses, enrollments, completions, statements] = await Promise.all([
      UserModel.countDocuments({ tenantId: req.tenant?.mongoId }),
      CourseModel.countDocuments({ tenantId: req.tenant?.mongoId, status: 'published' }),
      EnrollmentModel.find({ tenantId: req.tenant?.mongoId }).lean(),
      CompletionModel.find({ tenantId: req.tenant?.mongoId }).lean(),
      XapiStatementModel.countDocuments({ tenantId: req.tenant?.mongoId }),
    ])

    const completed = enrollments.filter((enrollment) => enrollment.status === 'completed').length
    const overdue = enrollments.filter((enrollment) => enrollment.status === 'overdue').length

    res.json({
      summary: {
        users,
        courses,
        enrollments: enrollments.length,
        completed,
        overdue,
        completionRate: enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0,
        xapiStatements: statements,
        completions: completions.length,
      },
      enrollments,
      completions,
    })
  }),
)
