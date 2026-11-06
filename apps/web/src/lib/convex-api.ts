import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'
import { api } from '@mimix/cloud/api'
import { ApiError, progressPageSchema, userSchema } from './api'

type Transport = Pick<ConvexHttpClient, 'query' | 'mutation'>
function normalize(error: unknown): never {
  if (error instanceof ApiError) throw error
  if (error instanceof ConvexError && error.data && typeof error.data==='object' && 'code' in error.data) {
    const statuses: Record<string,number>={UNAUTHENTICATED:401,IDENTITY_NOT_READY:404,INVALID_INPUT:400,NOT_FOUND:404,CONFLICT:409}
    const status=statuses[String(error.data.code)]
    throw new ApiError(status ?? 503)
  }
  throw new ApiError(503)
}
export function createConvexApiClient(url: string, token: string | null, transport?: Transport) {
  const client = transport ?? new ConvexHttpClient(url, { fetch: (input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)}) })
  if (!transport && token) (client as ConvexHttpClient).setAuth(token)
  let initialized: Promise<unknown> | undefined
  async function ready() {
    if (!token) throw new ApiError(401)
    initialized ??= client.mutation(api.identity.ensure, {})
    await initialized
  }
  return {
    async me() {
      try {
        await ready()
        const parsed=userSchema.safeParse(await client.query(api.identity.me,{}))
        if (!parsed.success) throw new ApiError(502)
        return parsed.data
      } catch(error){return normalize(error)}
    },
    async progress(after?:string) {
      try {
        if(after!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(after)) throw new ApiError(400)
        await ready()
        const parsed=progressPageSchema.safeParse(await client.query(api.learning.progress,after?{after}:{}))
        if (!parsed.success) throw new ApiError(502)
        return parsed.data
      } catch(error){return normalize(error)}
    },
  }
}
