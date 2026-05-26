import { Router } from 'express'
import { connectDatabase, getDatabaseStatus } from '../config/database.js'

export const healthRouter = Router()

healthRouter.get('/', async (_, res) => {
  try {
    await connectDatabase()
  } catch {
    // Health still reports the database state so deployment checks can see the failure.
  }

  res.json({
    ok: true,
    service: 'soteria-forge-api',
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  })
})
