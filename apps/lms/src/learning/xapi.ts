import { createXapiStatement, xapiVerbs, type UserDTO } from '@soteria-forge/shared'

export function createLessonStatement(input: {
  tenantId: string
  user: UserDTO
  verb: keyof typeof xapiVerbs
  objectId: string
  name: string
  description?: string
  completion?: boolean
  success?: boolean
  score?: number
}) {
  return createXapiStatement({
    tenantId: input.tenantId,
    actor: {
      account: {
        homePage: window.location.origin,
        name: input.user.id,
      },
      name: input.user.name,
    },
    verb: {
      id: xapiVerbs[input.verb],
      display: { 'en-US': input.verb },
    },
    object: {
      id: `${window.location.origin}/learning/${input.objectId}`,
      definition: {
        name: { 'en-US': input.name },
        description: input.description ? { 'en-US': input.description } : undefined,
      },
    },
    result: {
      completion: input.completion,
      success: input.success,
      score: input.score === undefined ? undefined : { scaled: input.score / 100, raw: input.score, min: 0, max: 100 },
    },
  })
}
