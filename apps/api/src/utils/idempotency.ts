import type { Model } from 'mongoose'

export function duplicateKey(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000
}

export async function createOrFindByIdempotency<T>(
  model: Model<T>,
  query: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  try {
    return await model.create(body as any)
  } catch (error) {
    if (!duplicateKey(error)) throw error
    return model.findOne(query)
  }
}
