import { z } from 'zod'
import type { VerifiedIdentity } from '../identity/identity.contract.js'
export interface DeviceActor { userId: string; identity: VerifiedIdentity }
export class DeviceError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503, message = 'device request denied') { super(message) }
}
export function parseDevice<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new DeviceError(400, 'invalid device request')
  return parsed.data
}
export const deviceId = z.uuid().transform(value => value.toLowerCase())
export const deviceToken = z.string().regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
