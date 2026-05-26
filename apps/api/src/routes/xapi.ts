import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { XapiStatementModel } from '../models/index.js'
import { createOrFindByIdempotency } from '../utils/idempotency.js'

export const xapiRouter = Router()

xapiRouter.post(
  '/statements',
  requireAuth,
  asyncHandler(async (req, res) => {
    const statement = req.body
    const statementId = String(statement.id ?? '')
    if (!statementId) {
      res.status(400).json({ error: 'xAPI statement id is required' })
      return
    }

    const saved = await createOrFindByIdempotency(
      XapiStatementModel,
      { tenantId: req.tenant?.mongoId, statementId },
      {
        tenantId: req.tenant?.mongoId,
        statementId,
        actor: statement.actor,
        verb: statement.verb,
        object: statement.object,
        result: statement.result,
        context: statement.context,
        timestamp: new Date(statement.timestamp ?? Date.now()),
        idempotencyKey: req.header('idempotency-key'),
      },
    )

    res.status(201).json({ statement: saved })
  }),
)
