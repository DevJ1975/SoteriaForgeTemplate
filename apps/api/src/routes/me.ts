import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { CertificateModel } from '../models/index.js'
import { serializeCertificate } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const meRouter = Router()

meRouter.get('/', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    tenant: req.tenant,
  })
})

meRouter.get(
  '/certificates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const certificates = await CertificateModel.find(tenantQuery(req, { userId: req.user?.mongoId })).sort({ issuedAt: -1 })
    res.json({ certificates: certificates.map(serializeCertificate) })
  }),
)
