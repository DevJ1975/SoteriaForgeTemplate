import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { AttemptModel } from '../models/index.js'
import { createOrFindByIdempotency } from '../utils/idempotency.js'

export const attemptsRouter = Router()

attemptsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.body.idempotencyKey ?? req.header('idempotency-key') ?? '')
    if (!idempotencyKey) {
      res.status(400).json({ error: 'idempotencyKey is required' })
      return
    }

    const attempt = await createOrFindByIdempotency(
      AttemptModel,
      { tenantId: req.tenant?.mongoId, idempotencyKey },
      {
        tenantId: req.tenant?.mongoId,
        userId: req.user?.mongoId,
        courseId: req.body.courseId,
        lessonId: req.body.lessonId,
        kind: req.body.kind,
        status: req.body.status ?? 'started',
        score: req.body.score,
        payload: req.body.payload,
        idempotencyKey,
      },
    )

    res.status(201).json({ attempt })
  }),
)
