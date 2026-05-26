import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import { CourseModel, EnrollmentModel } from '../models/index.js'
import { accessibleCourseFilter } from '../utils/entitlements.js'
import { serializeCourse, serializeEnrollment } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const coursesRouter = Router()

coursesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const canSeeDrafts = req.user?.roles.includes('admin') || req.user?.roles.includes('superadmin')
    const entitlementFilter = await accessibleCourseFilter(req)
    const courses = await CourseModel.find(
      tenantQuery(req, {
        ...(canSeeDrafts ? { status: { $ne: 'archived' } } : { status: 'published' }),
        ...entitlementFilter,
      }),
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
    const entitlementFilter = await accessibleCourseFilter(req)
    const course = await CourseModel.findOne(
      tenantQuery(req, { status: { $ne: 'archived' }, $and: [{ _id: req.params.id }, entitlementFilter] }),
    )

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
      slug: req.body.slug,
      description: req.body.description ?? '',
      publicSummary: req.body.publicSummary,
      audience: req.body.audience ?? [],
      outcomes: req.body.outcomes ?? [],
      category: req.body.category,
      role: req.body.role,
      topic: req.body.topic,
      durationMinutes: req.body.durationMinutes,
      certificateLabel: req.body.certificateLabel,
      complianceDisclaimers: req.body.complianceDisclaimers ?? [],
      contactHourTargetMinutes: req.body.contactHourTargetMinutes,
      sequenceLocked: req.body.sequenceLocked ?? false,
      passingScore: req.body.passingScore,
      attemptLimit: req.body.attemptLimit,
      languageVariants: req.body.languageVariants ?? [],
      studyGuideAssetId: req.body.studyGuideAssetId,
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
