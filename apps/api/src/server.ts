import { app } from './app.js'
import { env } from './config/env.js'
import { connectDatabase } from './config/database.js'

async function startServer() {
  app.listen(env.port, () => {
    console.log(`Soteria Forge API running on http://localhost:${env.port}`)
  })

  connectDatabase().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown database error'
    console.error(`Unable to connect to MongoDB. API will still start. ${message}`)
  })
}

void startServer()
