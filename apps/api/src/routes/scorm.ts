import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { AssetModel, ScormRuntimeModel } from '../models/index.js'

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
    const runtime = await ScormRuntimeModel.findOneAndUpdate(
      { tenantId: req.tenant?.mongoId, attemptId: req.params.attemptId },
      {
        $set: {
          tenantId: req.tenant?.mongoId,
          attemptId: req.params.attemptId,
          packageId: req.body.packageId,
          version: req.body.version,
          lessonStatus: req.body.lessonStatus,
          completionStatus: req.body.completionStatus,
          successStatus: req.body.successStatus,
          scoreRaw: req.body.scoreRaw,
          scoreMin: req.body.scoreMin,
          scoreMax: req.body.scoreMax,
          suspendData: req.body.suspendData,
          location: req.body.location,
          sessionTime: req.body.sessionTime,
          totalTime: req.body.totalTime,
          interactions: req.body.interactions ?? [],
        },
      },
      { upsert: true, new: true },
    )

    res.json({ runtime })
  }),
)
