import { z } from 'zod'

// The attempt, user, UUID and sequence belong to the host, never to challenge code.
export const learningRecordSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('answer_submitted'), payload: z.strictObject({ correct: z.boolean() }) }),
  ...(['hint_requested', 'attempt_completed', 'attempt_abandoned'] as const).map(type =>
    z.strictObject({ type: z.literal(type), payload: z.strictObject({}) })),
])
export type LearningRecord = z.infer<typeof learningRecordSchema>
