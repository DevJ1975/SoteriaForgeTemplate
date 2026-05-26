import type { NextFunction, Request, Response } from 'express'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function errorHandler(error: unknown, _: Request, res: Response, __: NextFunction) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Unexpected API error'
  res.status(status).json({ error: message })
}
