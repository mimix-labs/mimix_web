import { z } from 'zod'
import { learningRecordSchema } from './learning.js'

export const offlineUuid = z.uuid().transform(value => value.toLowerCase())
const reference = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
export const offlineSecret = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const offlineAttemptSchema = z.strictObject({ attemptId: offlineUuid, startedEventId: offlineUuid, challengeId: reference, challengeVersion: reference })
const fields = { eventId: offlineUuid, sequence: z.number().int().min(2).max(1000000) }
export const offlineRecordSchema = z.discriminatedUnion('type', [
  learningRecordSchema.options[0].extend(fields),
  ...learningRecordSchema.options.slice(1).map(schema => schema.extend(fields)),
])
export const offlineEventSchema = z.union([
  z.strictObject({ eventId: offlineUuid, sequence: z.literal(1), type: z.literal('attempt_started'), payload: z.strictObject({}) }),
  offlineRecordSchema,
])
export const offlineAppendSchema = z.strictObject({ attemptId: offlineUuid, event: offlineRecordSchema })
export const syncBindSchema = z.strictObject({ sessionId: offlineUuid, claimKey: offlineSecret })
export const syncBatchSchema = syncBindSchema.extend({ attempt: offlineAttemptSchema, events: z.array(offlineEventSchema).min(1).max(50) })
export const syncBindingSchema = z.strictObject({ sessionId: offlineUuid, userId: offlineUuid, serverTime: z.number().int().nonnegative().safe() })
export const syncReceiptSchema = syncBindingSchema.extend({ attemptId: offlineUuid, cloudAttemptId: offlineUuid,
  events: z.array(z.strictObject({ eventId: offlineUuid, sequence: z.number().int().min(1).max(1000000) })).min(1).max(50) })
export type OfflineAttempt = z.infer<typeof offlineAttemptSchema>
export type OfflineEvent = z.infer<typeof offlineEventSchema>
export type SyncBatch = z.infer<typeof syncBatchSchema>
export type SyncBinding = z.infer<typeof syncBindingSchema>
export type SyncReceipt = z.infer<typeof syncReceiptSchema>
