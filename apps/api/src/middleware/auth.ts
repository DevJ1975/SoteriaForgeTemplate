import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { hasRequiredRole, type UserRole } from '@soteria-forge/shared'
import { env } from '../config/env.js'
import { UserModel } from '../models/index.js'

type SessionClaims = {
  sub: string
  tenantId: string
}

export function signSession(userId: string, tenantId: string) {
  return jwt.sign({ sub: userId, tenantId }, env.jwtSecret, { expiresIn: '12h' })
}

export async function attachUser(req: Request, _: Response, next: NextFunction) {
  const authorization = req.header('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined
  const token = bearer ?? req.cookies?.[env.cookieName]

  if (!token) {
    next()
    return
  }

  try {
    const claims = jwt.verify(token, env.jwtSecret) as SessionClaims
    const user = await UserModel.findOne({ _id: claims.sub, tenantId: claims.tenantId })

    if (user) {
      req.user = {
        id: user.id,
        mongoId: user._id,
        tenantId: user.tenantId.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles as UserRole[],
        jobTitle: user.jobTitle ?? undefined,
        department: user.department ?? undefined,
        crew: user.crew ?? undefined,
        site: user.site ?? undefined,
      }
    }
  } catch {
    // Invalid sessions are treated as anonymous; protected routes still reject.
  }

  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  next()
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (!hasRequiredRole(req.user.roles, roles)) {
      res.status(403).json({ error: 'Insufficient role' })
      return
    }

    next()
  }
}
