import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import { signSession } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { TenantModel, UserModel } from '../models/index.js'
import { serializeTenant, serializeUser } from '../utils/serialize.js'

export const authRouter = Router()

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const password = String(req.body.password ?? '')
    const tenantSlug = String(req.body.tenantSlug ?? req.tenant?.slug ?? 'demo')
    const tenant = await TenantModel.findOne({ slug: tenantSlug, status: { $ne: 'archived' } })

    if (!tenant) {
      res.status(401).json({ error: 'Invalid email, password, or tenant' })
      return
    }

    const user = await UserModel.findOne({ tenantId: tenant._id, email })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email, password, or tenant' })
      return
    }

    user.lastLoginAt = new Date()
    await user.save()

    const token = signSession(user.id, tenant.id)
    res.cookie(env.cookieName, token, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    })

    res.json({
      token,
      user: serializeUser(user),
      tenant: serializeTenant(tenant),
    })
  }),
)

authRouter.post('/logout', (_, res) => {
  res.clearCookie(env.cookieName)
  res.status(204).send()
})
