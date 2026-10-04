import { z } from 'zod'
import { learningRecordSchema } from '@mimix/contracts'
export class LearningError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, message: string) { super(message) }
}
export const uuidInput = z.uuid().transform(v => v.toLowerCase())
const reference = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
export const createInput = z.strictObject({ idempotencyKey: uuidInput, challengeId: reference, challengeVersion: reference })
const fields = { eventId: uuidInput, sequence: z.number().int().min(2).max(1000000) }
export const eventInput = z.discriminatedUnion('type', [
  learningRecordSchema.options[0].extend(fields),
  ...learningRecordSchema.options.slice(1).map(schema => schema.extend(fields)),
])
export const progressQuery = z.strictObject({ after: uuidInput.optional() })
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new LearningError(400, 'invalid learning request')
  return result.data
}
export type CreateInput = z.infer<typeof createInput>
export type EventInput = z.infer<typeof eventInput>
