import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { CourseModel, EnrollmentModel } from '../models/index.js'
import { serializeCourse, serializeEnrollment } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const coursesRouter = Router()

coursesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const canSeeDrafts = req.user?.roles.includes('admin') || req.user?.roles.includes('superadmin')
    const courses = await CourseModel.find(
      tenantQuery(req, canSeeDrafts ? { status: { $ne: 'archived' } } : { status: 'published' }),
    ).sort({ updatedAt: -1 })
    const enrollments = req.user
      ? await EnrollmentModel.find(tenantQuery(req, { userId: req.user.mongoId }))
      : []

    res.json({
      courses: courses.map(serializeCourse),
      enrollments: enrollments.map(serializeEnrollment),
    })
  }),
)

coursesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const course = await CourseModel.findOne(tenantQuery(req, { _id: req.params.id, status: { $ne: 'archived' } }))

    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    res.json({ course: serializeCourse(course) })
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

coursesRouter.post(
  '/:id/publish',
  requireAuth,
  requireRoles('admin', 'superadmin'),
  auditAction('course.publish', 'Course'),
  asyncHandler(async (req, res) => {
    const course = await CourseModel.findOneAndUpdate(
      tenantQuery(req, { _id: req.params.id }),
      { $set: { status: 'published' } },
      { returnDocument: 'after' },
    )

    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    req.audit = { action: 'course.publish', resourceType: 'Course', resourceId: course.id }
    res.json({ course: serializeCourse(course) })
  }),
)
