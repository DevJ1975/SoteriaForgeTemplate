import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { CompletionModel, EnrollmentModel } from '../models/index.js'
import { createOrFindByIdempotency } from '../utils/idempotency.js'

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

    await EnrollmentModel.findOneAndUpdate(
      { tenantId: req.tenant?.mongoId, userId: req.user?.mongoId, courseId: req.body.courseId },
      { $set: { status: 'completed', progress: 100, completedAt: new Date() } },
    )

    res.status(201).json({ completion })
  }),
)
