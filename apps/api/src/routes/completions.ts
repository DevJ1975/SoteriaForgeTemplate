import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { CertificateModel, CompletionModel, CourseModel, EnrollmentModel } from '../models/index.js'
import { createOrFindByIdempotency } from '../utils/idempotency.js'
import { serializeCertificate, serializeCompletion } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const completionsRouter = Router()

completionsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.body.idempotencyKey ?? req.header('idempotency-key') ?? '')
    if (!idempotencyKey) {
      res.status(400).json({ error: 'idempotencyKey is required' })
      return
    }

    const completion = await createOrFindByIdempotency(
      CompletionModel,
      { tenantId: req.tenant?.mongoId, idempotencyKey },
      {
        tenantId: req.tenant?.mongoId,
        userId: req.user?.mongoId,
        courseId: req.body.courseId,
        lessonId: req.body.lessonId,
        source: req.body.source ?? 'online',
        idempotencyKey,
      },
    )

    const enrollment = await EnrollmentModel.findOneAndUpdate(
      tenantQuery(req, { userId: req.user?.mongoId, courseId: req.body.courseId }),
      { $set: { status: 'completed', progress: 100, completedAt: new Date() } },
      { returnDocument: 'after' },
    )

    let certificate = null
    if (enrollment) {
      const course = await CourseModel.findOne(tenantQuery(req, { _id: req.body.courseId }))
      const issuedAt = new Date()
      const expiresAt = course?.certificateExpiresInDays
        ? new Date(issuedAt.getTime() + course.certificateExpiresInDays * 24 * 60 * 60 * 1000)
        : undefined

      certificate = await CertificateModel.findOneAndUpdate(
        tenantQuery(req, { userId: req.user?.mongoId, courseId: req.body.courseId, revokedAt: { $exists: false } }),
        {
          $setOnInsert: {
            tenantId: req.tenant?.mongoId,
            userId: req.user?.mongoId,
            courseId: req.body.courseId,
            certificateNumber: `SF-${Date.now()}-${String(req.user?.mongoId).slice(-5)}`,
            issuedAt,
            expiresAt,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
    }

    res.status(201).json({
      completion: completion ? serializeCompletion(completion) : completion,
      certificate: certificate ? serializeCertificate(certificate) : null,
    })
  }),
)
