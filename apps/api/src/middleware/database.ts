import type { NextFunction, Request, Response } from 'express'
import { connectDatabase } from '../config/database.js'

export async function ensureDatabase(req: Request, res: Response, next: NextFunction) {
  try {
    await connectDatabase()
    next()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect to MongoDB'
    res.status(503).json({
      error: 'Database unavailable',
      detail: message,
    })
  }
}
