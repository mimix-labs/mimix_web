import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
export const userView = v.object({ id: v.string(), createdAt: v.string() })
export const progressFields = {
  status: v.union(v.literal('active'), v.literal('completed'), v.literal('abandoned')),
  lastSequence: v.number(), answers: v.number(), correctAnswers: v.number(), hints: v.number(),
}
const fields = { eventId: v.string(), sequence: v.number() }
export const eventInput = v.union(
  v.object({ ...fields, type: v.literal('answer_submitted'), payload: v.object({ correct: v.boolean() }) }),
  v.object({ ...fields, type: v.literal('hint_requested'), payload: v.object({}) }),
  v.object({ ...fields, type: v.literal('attempt_completed'), payload: v.object({}) }),
  v.object({ ...fields, type: v.literal('attempt_abandoned'), payload: v.object({}) }),
)
export const attemptView = v.object({ id: v.string(), challengeId: v.string(), challengeVersion: v.string(), createdAt: v.string() })
export const progressView = v.object({ attemptId: v.string(), ...progressFields })
export const learningView = v.object({ attempt: attemptView, progress: progressView })
export default defineSchema({
  users: defineTable({ uuid: v.string(), issuer: v.string(), subject: v.string(), createdAt: v.string() })
    .index('by_issuer_and_subject', ['issuer', 'subject']).index('by_uuid', ['uuid']),
  challenges: defineTable({ challengeId: v.string(), version: v.string(), manifestJson: v.string(), progress: v.boolean() })
    .index('by_challengeId_and_version', ['challengeId', 'version']),
  attempts: defineTable({ uuid: v.string(), userId: v.id('users'), idempotencyKey: v.string(), challengeId: v.string(), challengeVersion: v.string(), createdAt: v.string(), ...progressFields })
    .index('by_uuid', ['uuid']).index('by_userId_and_idempotencyKey', ['userId', 'idempotencyKey']).index('by_userId_and_uuid', ['userId', 'uuid']),
  events: defineTable({ attemptId: v.id('attempts'), eventId: v.string(), sequence: v.number(), type: v.union(v.literal('attempt_started'), v.literal('answer_submitted'), v.literal('hint_requested'), v.literal('attempt_completed'), v.literal('attempt_abandoned')), payload: v.union(v.object({}), v.object({correct:v.boolean()})), receivedAt: v.string() })
    .index('by_attemptId_and_eventId', ['attemptId', 'eventId']).index('by_attemptId_and_sequence', ['attemptId', 'sequence']),
})
