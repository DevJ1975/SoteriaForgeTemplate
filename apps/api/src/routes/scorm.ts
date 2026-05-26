import { Router } from 'express'
import { isScormCompletionStatus, normalizeScormNumber } from '@soteria-forge/shared'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { AssetModel, AttemptModel, ScormRuntimeModel } from '../models/index.js'
import { recordCompletionAndProgress } from '../utils/completionRules.js'
import { serializeScormRuntime } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const scormRouter = Router()

scormRouter.get(
  '/packages/:id/launch',
  requireAuth,
  asyncHandler(async (req, res) => {
    const asset = await AssetModel.findOne({ _id: req.params.id, tenantId: req.tenant?.mongoId, kind: 'scorm-package' })
    if (!asset) {
      res.status(404).json({ error: 'SCORM package not found' })
      return
    }

    res.json({
      launchUrl: asset.sourceUrl,
      packageId: asset.id,
      runtimeApi: {
        scorm12: 'API',
        scorm2004: 'API_1484_11',
      },
    })
  }),
)

scormRouter.post(
  '/attempts/:attemptId/runtime',
  requireAuth,
  asyncHandler(async (req, res) => {
    const attempt = await AttemptModel.findOne(tenantQuery(req, { _id: req.params.attemptId, userId: req.user?.mongoId }))
    if (!attempt) {
      res.status(404).json({ error: 'SCORM attempt not found' })
      return
    }

    const packageId = String(req.body.packageId ?? '')
    const packageAsset = await AssetModel.findOne(tenantQuery(req, { _id: packageId, kind: 'scorm-package' }))
    if (!packageAsset) {
      res.status(404).json({ error: 'SCORM package not found' })
      return
    }

    const version = String(req.body.version ?? '1.2')
    if (!['1.2', '2004'].includes(version)) {
      res.status(400).json({ error: 'Unsupported SCORM runtime version' })
      return
    }

    const lessonStatus = req.body.lessonStatus
    const completionStatus = req.body.completionStatus
    const successStatus = req.body.successStatus
    const isComplete = isScormCompletionStatus(lessonStatus) || isScormCompletionStatus(completionStatus)

    const runtime = await ScormRuntimeModel.findOneAndUpdate(
      { tenantId: req.tenant?.mongoId, attemptId: req.params.attemptId },
      {
        $set: {
          tenantId: req.tenant?.mongoId,
          attemptId: req.params.attemptId,
          packageId,
          version,
          lessonStatus,
          completionStatus,
          successStatus,
          scoreRaw: normalizeScormNumber(req.body.scoreRaw),
          scoreMin: normalizeScormNumber(req.body.scoreMin),
          scoreMax: normalizeScormNumber(req.body.scoreMax),
          suspendData: req.body.suspendData,
          location: req.body.location,
          sessionTime: req.body.sessionTime,
          totalTime: req.body.totalTime,
          interactions: req.body.interactions ?? [],
        },
      },
      { upsert: true, returnDocument: 'after' },
    )

    let completion = null
    if (isComplete) {
      attempt.status = successStatus === 'failed' ? 'failed' : 'completed'
      attempt.score = normalizeScormNumber(req.body.scoreRaw)
      await attempt.save()

      completion = await recordCompletionAndProgress({
        tenantId: req.tenant?.mongoId,
        userId: req.user?.mongoId,
        courseId: String(attempt.courseId),
        lessonId: String(attempt.lessonId),
        source: 'scorm-runtime',
        idempotencyKey: `scorm-completion-${attempt.id}`,
      })
    }

    res.json({ runtime: serializeScormRuntime(runtime), completion })
  }),
)

scormRouter.get(
  '/attempts/:attemptId/runtime',
  requireAuth,
  asyncHandler(async (req, res) => {
    const attempt = await AttemptModel.findOne(tenantQuery(req, { _id: req.params.attemptId, userId: req.user?.mongoId }))
    if (!attempt) {
      res.status(404).json({ error: 'SCORM attempt not found' })
      return
    }

    const runtime = await ScormRuntimeModel.findOne(tenantQuery(req, { attemptId: req.params.attemptId }))
    res.json({ runtime: runtime ? serializeScormRuntime(runtime) : null })
  }),
)
