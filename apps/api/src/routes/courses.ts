import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { CourseModel, EnrollmentModel } from '../models/index.js'
import { serializeCourse } from '../utils/serialize.js'

export const coursesRouter = Router()

coursesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const courses = await CourseModel.find({ tenantId: req.tenant?.mongoId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 })
    const enrollments = req.user
      ? await EnrollmentModel.find({ tenantId: req.tenant?.mongoId, userId: req.user.mongoId })
      : []

    res.json({
      courses: courses.map(serializeCourse),
      enrollments: enrollments.map((enrollment) => ({
        id: enrollment.id,
        tenantId: enrollment.tenantId.toString(),
        userId: enrollment.userId.toString(),
        courseId: enrollment.courseId.toString(),
        status: enrollment.status,
        dueAt: enrollment.dueAt?.toISOString(),
        completedAt: enrollment.completedAt?.toISOString(),
        progress: enrollment.progress,
      })),
    })
  }),
)

coursesRouter.post(
  '/',
  requireAuth,
  requireRoles('admin', 'superadmin'),
  auditAction('course.create', 'Course'),
  asyncHandler(async (req, res) => {
    const course = await CourseModel.create({
      tenantId: req.tenant?.mongoId,
      title: req.body.title,
      description: req.body.description ?? '',
      status: req.body.status ?? 'draft',
      tags: req.body.tags ?? [],
      fieldReadinessScore: req.body.fieldReadinessScore ?? 80,
      certificateExpiresInDays: req.body.certificateExpiresInDays,
      modules: req.body.modules ?? [],
    })

    req.audit = { action: 'course.create', resourceType: 'Course', resourceId: course.id }
    res.status(201).json({ course: serializeCourse(course) })
  }),
)
