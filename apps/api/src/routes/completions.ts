import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { CompletionModel } from '../models/index.js'
import { recordCompletionAndProgress } from '../utils/completionRules.js'
import { serializeCompletion } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const completionsRouter = Router()

completionsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const completions = await CompletionModel.find(tenantQuery(req, { userId: req.user?.mongoId })).sort({ completedAt: -1 })
    res.json({ completions: completions.map(serializeCompletion) })
  }),
)

completionsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.body.idempotencyKey ?? req.header('idempotency-key') ?? '')
    if (!idempotencyKey) {
      res.status(400).json({ error: 'idempotencyKey is required' })
      return
    }

    try {
      const result = await recordCompletionAndProgress({
        tenantId: req.tenant?.mongoId,
        userId: req.user?.mongoId,
        courseId: req.body.courseId,
        lessonId: req.body.lessonId,
        source: req.body.source ?? 'online',
        idempotencyKey,
      })
      res.status(201).json(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        res.status(404).json({ error: error.message })
        return
      }
      throw error
    }
  }),
)
