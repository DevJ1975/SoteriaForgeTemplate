import { Router } from 'express'
import { isEmailLike, requireStringField } from '@soteria-forge/shared'
import { asyncHandler } from '../middleware/errors.js'
import { LeadModel } from '../models/index.js'

export const leadsRouter = Router()

leadsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = requireStringField(req.body, 'name')
    const email = requireStringField(req.body, 'email').toLowerCase()

    if (!isEmailLike(email)) {
      res.status(400).json({ error: 'A valid email is required' })
      return
    }

    const lead: any = await LeadModel.create({
      name,
      email,
      company: req.body.company,
      teamSize: req.body.teamSize,
      interest: req.body.interest,
      message: req.body.message,
      sourcePath: req.body.sourcePath,
    })

    res.status(201).json({
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        company: lead.company,
        teamSize: lead.teamSize,
        interest: lead.interest,
        message: lead.message,
        sourcePath: lead.sourcePath,
        status: lead.status,
        createdAt: lead.createdAt?.toISOString?.() ?? new Date().toISOString(),
      },
    })
  }),
)
