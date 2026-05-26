import { Router } from 'express'
import type { SyncResponse } from '@soteria-forge/shared'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { AttemptModel, CompletionModel, ScormRuntimeModel, XapiStatementModel } from '../models/index.js'
import { duplicateKey } from '../utils/idempotency.js'

export const syncRouter = Router()

syncRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const response: SyncResponse = { accepted: [], rejected: [] }
    const items = Array.isArray(req.body.items) ? req.body.items : []

    for (const item of items) {
      try {
        if (!item.idempotencyKey) throw new Error('Missing idempotencyKey')

        if (item.type === 'xapi-statement') {
          const statement = item.payload
          await XapiStatementModel.create({
            tenantId: req.tenant?.mongoId,
            statementId: statement.id,
            actor: statement.actor,
            verb: statement.verb,
            object: statement.object,
            result: statement.result,
            context: statement.context,
            timestamp: new Date(statement.timestamp ?? Date.now()),
            idempotencyKey: item.idempotencyKey,
          })
        } else if (item.type === 'attempt') {
          await AttemptModel.create({
            tenantId: req.tenant?.mongoId,
            userId: req.user?.mongoId,
            idempotencyKey: item.idempotencyKey,
            ...item.payload,
          })
        } else if (item.type === 'completion') {
          await CompletionModel.create({
            tenantId: req.tenant?.mongoId,
            userId: req.user?.mongoId,
            idempotencyKey: item.idempotencyKey,
            source: 'offline-sync',
            ...item.payload,
          })
        } else if (item.type === 'scorm-runtime') {
          await ScormRuntimeModel.create({
            tenantId: req.tenant?.mongoId,
            ...item.payload,
          })
        }

        response.accepted.push(item.idempotencyKey)
      } catch (error) {
        if (duplicateKey(error)) {
          response.accepted.push(item.idempotencyKey)
        } else {
          response.rejected.push({
            idempotencyKey: item.idempotencyKey ?? 'unknown',
            reason: error instanceof Error ? error.message : 'Sync item failed',
          })
        }
      }
    }

    res.json(response)
  }),
)
