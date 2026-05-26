import type { HydratedDocument, Types } from 'mongoose'
import type { TenantDTO, UserDTO, UserRole } from '@soteria-forge/shared'

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantDTO & { mongoId: Types.ObjectId }
      user?: UserDTO & { mongoId: Types.ObjectId; roles: UserRole[] }
      audit?: {
        action: string
        resourceType?: string
        resourceId?: string
        metadata?: Record<string, unknown>
      }
    }
  }
}

export {}
