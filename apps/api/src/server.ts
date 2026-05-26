import { app } from './app.js'
import { env } from './config/env.js'

async function startServer() {
  app.listen(env.port, () => {
    console.log(`Soteria Forge API running on http://localhost:${env.port}`)
  })
}

void startServer()
