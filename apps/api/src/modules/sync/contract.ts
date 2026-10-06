import { createHash, timingSafeEqual } from 'node:crypto'
import type { z } from 'zod'
export class SyncError extends Error {
  get state() { return this.status === 401 ? 'login_required' : this.status === 409 ? 'conflict' : this.status === 507 ? 'storage_full' : this.message === 'offline storage unavailable' ? 'storage_unavailable' : 'pending' }
  constructor(readonly status: 400 | 401 | 404 | 409 | 429 | 503 | 507, message: string) { super(message) }
}
export function parseSync<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new SyncError(400, 'invalid sync request')
  return result.data
}
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
export const sameSecret = (actual: string, expected: string): boolean => timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(expected))
