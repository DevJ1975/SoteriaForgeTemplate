import { Router } from 'express'
import { getDatabaseStatus } from '../config/database.js'

export const healthRouter = Router()

healthRouter.get('/', (_, res) => {
  res.json({
    ok: true,
    service: 'soteria-forge-api',
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  })
})
