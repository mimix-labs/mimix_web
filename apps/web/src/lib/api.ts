import { z } from 'zod'
import { observe } from './telemetry'

export const userSchema = z.object({ id: z.uuid(), createdAt: z.string().refine(value => Number.isFinite(Date.parse(value))) })
const count = z.number().int().nonnegative()
export const progressPageSchema = z.object({
  items: z.array(z.object({
    attempt: z.object({ id: z.uuid(), challengeId: z.string().min(1), challengeVersion: z.string().min(1), createdAt: z.string().refine(value => Number.isFinite(Date.parse(value))) }),
    progress: z.object({ attemptId: z.uuid(), status: z.enum(['active', 'completed', 'abandoned']), lastSequence: z.number().int().positive(), answers: count, correctAnswers: count, hints: count }),
  }).refine(item => item.attempt.id === item.progress.attemptId && item.progress.correctAnswers <= item.progress.answers)).max(50),
  nextCursor: z.uuid().nullable(),
})
export type ProgressPage = z.infer<typeof progressPageSchema>
export class ApiError extends Error {
  constructor(readonly status: number) { super('Mimix API request failed') }
}
export function createApiClient(origin: string, token: string | null, timeoutMs = 5000) {
  async function read<T>(operation: 'me' | 'progress', path: string, schema: z.ZodType<T>): Promise<T> {
    if (!token) throw new ApiError(401)
    const start = performance.now()
    let status = 503
    try {
      const response = await fetch(new URL(path, origin), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
      status = response.status
      if (status >= 300 && status < 400) throw new ApiError(502)
      if (!response.ok) throw new ApiError(response.status)
      let data: unknown
      try { data = await response.json() } catch { throw new ApiError(502) }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new ApiError(502)
      return parsed.data
    } catch (error) {
      if (error instanceof ApiError) { status = error.status; throw error }
      status = 503
      throw new ApiError(status)
    } finally { observe({ event: 'api_read', operation, status, durationMs: Math.round(performance.now() - start) }) }
  }
  return {
    me: () => read('me', '/api/identity/me', userSchema),
    progress: async (after?: string) => {
      if (after && !z.uuid().safeParse(after).success) throw new ApiError(400)
      return read('progress', `/api/learning/progress${after ? `?after=${encodeURIComponent(after)}` : ''}`, progressPageSchema)
    },
  }
}
