import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app } = await import('../apps/api/src/app.js')
  return app(req, res)
}
