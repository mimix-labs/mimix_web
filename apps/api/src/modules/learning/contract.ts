import { z } from 'zod'
export class LearningError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, message: string) { super(message) }
}
export const uuidInput = z.uuid().transform(v => v.toLowerCase())
const reference = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
export const createInput = z.strictObject({ idempotencyKey: uuidInput, challengeId: reference, challengeVersion: reference })
const fields = { eventId: uuidInput, sequence: z.number().int().min(2).max(1000000) }
export const eventInput = z.discriminatedUnion('type', [
  z.strictObject({ ...fields, type: z.literal('answer_submitted'), payload: z.strictObject({ correct: z.boolean() }) }),
  ...(['hint_requested', 'attempt_completed', 'attempt_abandoned'] as const).map(type => z.strictObject({ ...fields, type: z.literal(type), payload: z.strictObject({}) })),
])
export const progressQuery = z.strictObject({ after: uuidInput.optional() })
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new LearningError(400, 'invalid learning request')
  return result.data
}
export type CreateInput = z.infer<typeof createInput>
export type EventInput = z.infer<typeof eventInput>
