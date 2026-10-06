import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import type { Database, Transaction } from '../../database/database.js'
import { attempts, attemptProgress, learningEvents, campaignAttempts } from '../../database/schema.js'
import { createInput, eventInput, LearningError, parse, uuidInput, type CreateInput, type EventInput } from './contract.js'
import { project } from './projection.js'

// Shared across writes; exclusive for reconstruction. Acquired before all row locks.
const writerLock = sql`select pg_advisory_xact_lock_shared(102, 1)`
export class LearningStore {
  constructor(private readonly database: Database) {}
  async create(userId: string, value: unknown) {
    const input = parse(createInput, value)
    return this.database.db.transaction(tx => this.createInTransaction(tx, userId, input))
  }
  async createInTransaction(tx: Transaction, userId: string, input: CreateInput, context?: { campaignId: string; campaignVersion: string; nodeId: string }, startEventId: string = randomUUID()) {
    await tx.execute(writerLock)
    const [inserted] = await tx.insert(attempts).values({ id: randomUUID(), userId, ...input }).onConflictDoNothing({ target: [attempts.userId, attempts.idempotencyKey] }).returning()
    if (!inserted) {
      const [existing] = await tx.select().from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.idempotencyKey, input.idempotencyKey)))
      if (!existing || existing.challengeId !== input.challengeId || existing.challengeVersion !== input.challengeVersion) throw new LearningError(409, 'idempotency conflict')
      const [binding] = await tx.select().from(campaignAttempts).where(eq(campaignAttempts.attemptId, existing.id))
      if (context ? !binding || binding.campaignId !== context.campaignId || binding.campaignVersion !== context.campaignVersion || binding.nodeId !== context.nodeId : binding) throw new LearningError(409, 'idempotency conflict')
      return { attempt: existing, duplicate: true }
    }
    const [event] = await tx.insert(learningEvents).values({ attemptId: inserted.id, eventId: startEventId, sequence: 1, type: 'attempt_started', payload: {} }).returning()
    await tx.insert(attemptProgress).values(project(undefined, event))
    if (context) await tx.insert(campaignAttempts).values({ attemptId: inserted.id, ...context })
    return { attempt: inserted, duplicate: false }
  }
  async append(userId: string, id: string, value: unknown) {
    const attemptId = parse(uuidInput, id), input = parse(eventInput, value)
    return this.database.db.transaction(tx => this.appendInTransaction(tx, userId, attemptId, input))
  }
  async appendInTransaction(tx: Transaction, userId: string, attemptId: string, input: EventInput) {
    await tx.execute(writerLock)
    const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId))).for('update')
    if (!attempt) throw new LearningError(404, 'attempt not found')
    const [existing] = await tx.select().from(learningEvents).where(and(eq(learningEvents.attemptId, attemptId), eq(learningEvents.eventId, input.eventId)))
    if (existing) {
      if (existing.sequence !== input.sequence || existing.type !== input.type || !isDeepStrictEqual(existing.payload, input.payload)) throw new LearningError(409, 'idempotency conflict')
      return { event: existing, duplicate: true }
    }
    const [previous] = await tx.select().from(attemptProgress).where(eq(attemptProgress.attemptId, attemptId))
    if (!previous) throw new LearningError(503, 'progress unavailable')
    if (previous.status !== 'active' || input.sequence !== previous.lastSequence + 1) throw new LearningError(409, 'attempt closed or sequence conflict')
    const [event] = await tx.insert(learningEvents).values({ attemptId, ...input }).returning()
    await tx.update(attemptProgress).set(project(previous, event)).where(eq(attemptProgress.attemptId, attemptId))
    return { event, duplicate: false }
  }
  async get(userId: string, id: string) {
    const [result] = await this.database.db.select({ attempt: attempts, progress: attemptProgress }).from(attempts)
      .innerJoin(attemptProgress, eq(attemptProgress.attemptId, attempts.id)).where(and(eq(attempts.id, parse(uuidInput, id)), eq(attempts.userId, userId)))
    if (!result) throw new LearningError(404, 'attempt not found')
    return result
  }
  async progress(userId: string, after?: string) {
    const rows = await this.database.db.select({ attempt: attempts, progress: attemptProgress }).from(attempts)
      .innerJoin(attemptProgress, eq(attemptProgress.attemptId, attempts.id))
      .where(and(eq(attempts.userId, userId), after ? gt(attempts.id, parse(uuidInput, after)) : undefined)).orderBy(asc(attempts.id)).limit(51)
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].attempt.id : null }
  }
  async rebuild(): Promise<void> {
    await this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(102, 1)`)
      await tx.delete(attemptProgress)
      // Keyset batches bound memory for operational reconstruction.
      let after: string | undefined
      for (;;) {
        const batch = await tx.select({ id: attempts.id }).from(attempts).where(after ? gt(attempts.id, after) : undefined).orderBy(asc(attempts.id)).limit(100)
        if (!batch.length) break
        for (const attempt of batch) {
          let previous
          let sequence = 0
          for (;;) {
            const events = await tx.select().from(learningEvents).where(and(eq(learningEvents.attemptId, attempt.id), gt(learningEvents.sequence, sequence))).orderBy(asc(learningEvents.sequence)).limit(500)
            if (!events.length) break
            for (const event of events) previous = project(previous, event)
            sequence = events[events.length - 1].sequence
          }
          if (!previous) throw new Error('Missing learning history')
          await tx.insert(attemptProgress).values(previous)
        }
        after = batch[batch.length - 1].id
      }
    })
  }
}
