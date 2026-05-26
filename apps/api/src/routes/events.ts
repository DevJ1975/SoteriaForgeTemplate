import { Router } from 'express'
import { requireStringField } from '@soteria-forge/shared'
import { asyncHandler } from '../middleware/errors.js'
import { AnalyticsEventModel } from '../models/index.js'

export const eventsRouter = Router()

eventsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const eventName = requireStringField(req.body, 'eventName')
    const event: any = await AnalyticsEventModel.create({
      eventName,
      sourcePath: req.body.sourcePath,
      courseSlug: req.body.courseSlug,
      packageSlug: req.body.packageSlug,
      metadata: req.body.metadata,
      anonymousId: req.body.anonymousId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    })

    res.status(201).json({
      event: {
        id: event.id,
        eventName: event.eventName,
        sourcePath: event.sourcePath,
        courseSlug: event.courseSlug,
        packageSlug: event.packageSlug,
        metadata: event.metadata,
        createdAt: event.createdAt?.toISOString?.() ?? new Date().toISOString(),
      },
    })
  }),
)
