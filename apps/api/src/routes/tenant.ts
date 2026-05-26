import { Router } from 'express'

export const tenantRouter = Router()

tenantRouter.get('/', (req, res) => {
  res.json({ tenant: req.tenant })
})
