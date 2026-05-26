import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { isEmailLike, normalizeRoles, requireStringField } from '@soteria-forge/shared'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { auditAction } from '../middleware/audit.js'
import { asyncHandler } from '../middleware/errors.js'
import {
  CertificateModel,
  CompletionModel,
  CourseModel,
  EnrollmentModel,
  UserModel,
  XapiStatementModel,
} from '../models/index.js'
import { enforceSeatLimit } from '../utils/entitlements.js'
import { serializeCertificate, serializeCompletion, serializeEnrollment, serializeUser } from '../utils/serialize.js'
import { tenantQuery, requireTenant } from '../utils/tenantScope.js'

export const adminRouter = Router()

const defaultInvitePassword = 'SoteriaForgeDemo!2026'

function isTenantAdmin(req: Parameters<typeof tenantQuery>[0]) {
  return Boolean(req.user?.roles.includes('admin') || req.user?.roles.includes('superadmin'))
}

async function scopedUserFilter(req: Parameters<typeof tenantQuery>[0]) {
  if (isTenantAdmin(req)) return tenantQuery(req)

  const scope: Record<string, unknown> = {}
  if (req.user?.department) scope.department = req.user.department
  if (req.user?.site) scope.site = req.user.site
  if (req.user?.crew) scope.crew = req.user.crew

  return tenantQuery(req, scope)
}

async function scopedUserIds(req: Parameters<typeof tenantQuery>[0]) {
  if (isTenantAdmin(req)) return undefined
  const users = await UserModel.find(await scopedUserFilter(req)).select('_id')
  return users.map((user) => user._id)
}

adminRouter.get(
  '/users',
  requireAuth,
  requireRoles('manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const users = await UserModel.find(await scopedUserFilter(req)).sort({ name: 1 })
    res.json({ users: users.map(serializeUser) })
  }),
)

adminRouter.post(
  '/users',
  requireAuth,
  requireRoles('admin', 'superadmin'),
  auditAction('user.create', 'User'),
  asyncHandler(async (req, res) => {
    const email = requireStringField(req.body, 'email').toLowerCase()
    const name = requireStringField(req.body, 'name')

    if (!isEmailLike(email)) {
      res.status(400).json({ error: 'A valid email is required' })
      return
    }

    try {
      await enforceSeatLimit(req)
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Seat limit exceeded' })
      return
    }

    const passwordHash = await bcrypt.hash(String(req.body.password ?? defaultInvitePassword), 12)
    const user = await UserModel.findOneAndUpdate(
      tenantQuery(req, { email }),
      {
        $setOnInsert: {
          tenantId: requireTenant(req),
          email,
          passwordHash,
          invitedAt: new Date(),
        },
        $set: {
          name,
          roles: normalizeRoles(req.body.roles),
          jobTitle: req.body.jobTitle,
          department: req.body.department,
          crew: req.body.crew,
          site: req.body.site,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )

    req.audit = { action: 'user.create', resourceType: 'User', resourceId: user.id }
    res.status(201).json({ user: serializeUser(user), temporaryPassword: req.body.password ? undefined : defaultInvitePassword })
  }),
)

adminRouter.post(
  '/users/import',
  requireAuth,
  requireRoles('admin', 'superadmin'),
  auditAction('users.import', 'User'),
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.users) ? req.body.users : []
    const imported = []
    const rejected = []

    try {
      await enforceSeatLimit(req, rows.length)
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Seat limit exceeded' })
      return
    }

    for (const row of rows) {
      try {
        const email = requireStringField(row, 'email').toLowerCase()
        const name = requireStringField(row, 'name')

        if (!isEmailLike(email)) throw new Error('Invalid email')

        const passwordHash = await bcrypt.hash(String(row.password ?? defaultInvitePassword), 12)
        const user = await UserModel.findOneAndUpdate(
          tenantQuery(req, { email }),
          {
            $setOnInsert: {
              tenantId: requireTenant(req),
              email,
              passwordHash,
              invitedAt: new Date(),
            },
            $set: {
              name,
              roles: normalizeRoles(row.roles),
              jobTitle: row.jobTitle,
              department: row.department,
              crew: row.crew,
              site: row.site,
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        imported.push(serializeUser(user))
      } catch (error) {
        rejected.push({
          email: row?.email,
          reason: error instanceof Error ? error.message : 'Import failed',
        })
      }
    }

    req.audit = { action: 'users.import', resourceType: 'User', metadata: { imported: imported.length, rejected: rejected.length } }
    res.status(201).json({ imported, rejected, temporaryPassword: defaultInvitePassword })
  }),
)

adminRouter.get(
  '/enrollments',
  requireAuth,
  requireRoles('manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const userIds = await scopedUserIds(req)
    const enrollments = await EnrollmentModel.find(tenantQuery(req, userIds ? { userId: { $in: userIds } } : {})).sort({ updatedAt: -1 })
    res.json({ enrollments: enrollments.map(serializeEnrollment) })
  }),
)

adminRouter.post(
  '/assignments',
  requireAuth,
  requireRoles('admin', 'superadmin'),
  auditAction('course.assign', 'Enrollment'),
  asyncHandler(async (req, res) => {
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(String).filter(Boolean) : []
    const courseId = requireStringField(req.body, 'courseId')

    if (!userIds.length) {
      res.status(400).json({ error: 'At least one userId is required' })
      return
    }

    const assignments = []
    for (const userId of userIds) {
      const enrollment = await EnrollmentModel.findOneAndUpdate(
        tenantQuery(req, { userId, courseId }),
        {
          $setOnInsert: {
            tenantId: requireTenant(req),
            userId,
            courseId,
          },
          $set: {
            status: 'assigned',
            dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      assignments.push(serializeEnrollment(enrollment))
    }

    req.audit = { action: 'course.assign', resourceType: 'Enrollment', metadata: { courseId, count: assignments.length } }
    res.status(201).json({ assignments })
  }),
)

adminRouter.get(
  '/certificates',
  requireAuth,
  requireRoles('manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const userIds = await scopedUserIds(req)
    const certificates = await CertificateModel.find(tenantQuery(req, userIds ? { userId: { $in: userIds } } : {})).sort({ issuedAt: -1 })
    res.json({ certificates: certificates.map(serializeCertificate) })
  }),
)

adminRouter.get(
  '/reports/completions',
  requireAuth,
  requireRoles('manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const userIds = await scopedUserIds(req)
    const scopedUserQuery = userIds ? { userId: { $in: userIds } } : {}
    const scopedUserCountQuery = await scopedUserFilter(req)
    const [users, courses, enrollments, completions, statements, certificates] = await Promise.all([
      UserModel.countDocuments(scopedUserCountQuery),
      CourseModel.countDocuments(tenantQuery(req, { status: 'published' })),
      EnrollmentModel.find(tenantQuery(req, scopedUserQuery)),
      CompletionModel.find(tenantQuery(req, scopedUserQuery)),
      XapiStatementModel.countDocuments(tenantQuery(req)),
      CertificateModel.countDocuments(tenantQuery(req, scopedUserQuery)),
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
        certificates,
      },
      enrollments: enrollments.map(serializeEnrollment),
      completions: completions.map(serializeCompletion),
    })
  }),
)
