import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { auditResponse } from './middleware/audit.js'
import { attachUser } from './middleware/auth.js'
import { ensureDatabase } from './middleware/database.js'
import { errorHandler } from './middleware/errors.js'
import { resolveTenant } from './middleware/tenant.js'
import { adminRouter } from './routes/admin.js'
import { attemptsRouter } from './routes/attempts.js'
import { authRouter } from './routes/auth.js'
import { billingRouter } from './routes/billing.js'
import { catalogRouter } from './routes/catalog.js'
import { checkoutRouter } from './routes/checkout.js'
import { completionsRouter } from './routes/completions.js'
import { coursesRouter } from './routes/courses.js'
import { enrollmentsRouter } from './routes/enrollments.js'
import { entitlementsRouter } from './routes/entitlements.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { scormRouter } from './routes/scorm.js'
import { stripeWebhookRouter } from './routes/stripeWebhook.js'
import { superadminRouter } from './routes/superadmin.js'
import { syncRouter } from './routes/sync.js'
import { tenantRouter } from './routes/tenant.js'
import { xapiRouter } from './routes/xapi.js'

export const app = express()

app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevOrigin =
        env.nodeEnv !== 'production' && origin !== undefined && /^http:\/\/localhost:\d+$/.test(origin)

      if (!origin || env.clientOrigins.includes(origin) || isLocalDevOrigin) {
        callback(null, true)
        return
      }

      callback(new Error(`CORS blocked origin: ${origin}`))
    },
  }),
)
app.use(cookieParser())
app.use(morgan('dev'))

app.use('/api/health', healthRouter)
app.use('/api/stripe', ensureDatabase, express.raw({ type: 'application/json' }), stripeWebhookRouter)
app.use(express.json())
app.use(ensureDatabase)
app.use('/api/catalog', catalogRouter)
app.use('/api/checkout', checkoutRouter)
app.use(resolveTenant)
app.use(attachUser)
app.use(auditResponse)
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
app.use('/api/tenant', tenantRouter)
app.use('/api/courses', coursesRouter)
app.use('/api/enrollments', enrollmentsRouter)
app.use('/api/attempts', attemptsRouter)
app.use('/api/completions', completionsRouter)
app.use('/api/sync', syncRouter)
app.use('/api/scorm', scormRouter)
app.use('/api/billing', billingRouter)
app.use('/api/entitlements', entitlementsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/superadmin', superadminRouter)
app.use('/xapi', xapiRouter)

app.use((_, res) => {
  res.status(404).json({
    error: 'Route not found',
  })
})

app.use(errorHandler)
