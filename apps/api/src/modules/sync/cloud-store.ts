import { and, eq, sql } from 'drizzle-orm'
import { syncBindSchema, syncBatchSchema } from '@mimix/contracts'
import type { Database, Transaction } from '../../database/database.js'
import { attempts, learningEvents, syncAttempts, syncSessions } from '../../database/schema.js'
import { LearningStore } from '../learning/store.js'
import { LearningError } from '../learning/contract.js'
import { digest, parseSync, sameSecret, SyncError } from './contract.js'

export class CloudSyncStore {
  private readonly learning: LearningStore
  constructor(private readonly database: Database) { this.learning = new LearningStore(database) }
  private async owner(tx: Transaction, userId: string, input: { sessionId: string; claimKey: string }) {
    const [session] = await tx.select().from(syncSessions).where(eq(syncSessions.id, input.sessionId)).for('update')
    if (!session || session.userId !== userId || !sameSecret(input.claimKey, session.claimHash)) throw new SyncError(409, 'binding conflict')
    return session
  }
  async bind(userId: string, value: unknown) {
    const input = parseSync(syncBindSchema, value)
    return this.database.db.transaction(async tx => {
      await tx.insert(syncSessions).values({ id: input.sessionId, userId, claimHash: digest(input.claimKey) }).onConflictDoNothing()
      await this.owner(tx, userId, input)
      return { sessionId: input.sessionId, userId, serverTime: Date.now() }
    })
  }
  async importBatch(userId: string, value: unknown) {
    const input = parseSync(syncBatchSchema, value)
    try {
      return await this.database.db.transaction(async tx => {
        // Same lock order as learning writers and projection reconstruction.
        await tx.execute(sql`select pg_advisory_xact_lock_shared(102, 1)`)
        await this.owner(tx, userId, input)
        for (let i = 1; i < input.events.length; i++) if (input.events[i].sequence <= input.events[i - 1].sequence) throw new SyncError(409, 'sequence conflict')
        let [mapping] = await tx.select().from(syncAttempts).where(and(eq(syncAttempts.sessionId, input.sessionId), eq(syncAttempts.localId, input.attempt.attemptId)))
        if (!mapping) {
          if (input.events[0].sequence !== 1) throw new SyncError(409, 'sequence conflict')
          const created = await this.learning.createInTransaction(tx, userId, {
            idempotencyKey: input.attempt.attemptId, challengeId: input.attempt.challengeId, challengeVersion: input.attempt.challengeVersion,
          }, undefined, input.attempt.startedEventId)
          if (created.duplicate) throw new SyncError(409, 'attempt mapping conflict')
          ;[mapping] = await tx.insert(syncAttempts).values({ sessionId: input.sessionId, localId: input.attempt.attemptId, attemptId: created.attempt.id }).returning()
        }
        const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, mapping.attemptId))
        const [start] = await tx.select().from(learningEvents).where(and(eq(learningEvents.attemptId, mapping.attemptId), eq(learningEvents.sequence, 1)))
        if (!attempt || attempt.userId !== userId || attempt.challengeId !== input.attempt.challengeId || attempt.challengeVersion !== input.attempt.challengeVersion || start?.eventId !== input.attempt.startedEventId) throw new SyncError(409, 'attempt mapping conflict')
        for (const event of input.events) {
          if (event.type === 'attempt_started') {
            if (event.eventId !== start.eventId) throw new SyncError(409, 'event conflict')
          } else await this.learning.appendInTransaction(tx, userId, mapping.attemptId, event)
        }
        return { sessionId: input.sessionId, userId, attemptId: input.attempt.attemptId, cloudAttemptId: mapping.attemptId,
          serverTime: Date.now(), events: input.events.map(({ eventId, sequence }) => ({ eventId, sequence })) }
      })
    } catch (error) {
      if (error instanceof LearningError) throw new SyncError(error.status, error.message)
      throw error
    }
  }
}
