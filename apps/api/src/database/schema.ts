import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
export const users = pgTable('users', { id: uuid().primaryKey(), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull() })
export const externalIdentities = pgTable('external_identities', {
  id: uuid().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id),
  provider: text().notNull(), issuer: text().notNull(), subject: text().notNull(),
}, t => [unique('external_identity_key').on(t.provider, t.issuer, t.subject)])
export const attempts = pgTable('attempts', {
  id: uuid().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id), idempotencyKey: uuid('idempotency_key').notNull(),
  challengeId: text('challenge_id').notNull(), challengeVersion: text('challenge_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, t => [unique('attempt_creation_key').on(t.userId, t.idempotencyKey), index('attempt_owner_page').on(t.userId, t.id),
  check('challenge_reference', sql`${t.challengeId} ~ '^[A-Za-z0-9._-]{1,80}$' AND ${t.challengeVersion} ~ '^[A-Za-z0-9._-]{1,80}$'`)])
export const learningEvents = pgTable('learning_events', {
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id), eventId: uuid('event_id').notNull(),
  sequence: integer().notNull(), schemaVersion: integer('schema_version').notNull().default(1), type: text().notNull(),
  payload: jsonb().notNull().$type<Record<string, unknown>>(), receivedAt: timestamp('received_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, t => [primaryKey({ columns: [t.attemptId, t.eventId] }), unique('event_sequence').on(t.attemptId, t.sequence),
  check('event_sequence_bounds', sql`${t.sequence} BETWEEN 1 AND 1000000`), check('event_version', sql`${t.schemaVersion} = 1`),
  check('event_contract', sql`(${t.type} = 'attempt_started' AND ${t.sequence} = 1 AND ${t.payload} = '{}'::jsonb) OR (${t.sequence} > 1 AND ((${t.type} IN ('hint_requested','attempt_completed','attempt_abandoned') AND ${t.payload} = '{}'::jsonb) OR (${t.type} = 'answer_submitted' AND coalesce(jsonb_typeof(${t.payload}->'correct'), '') = 'boolean' AND ${t.payload} - 'correct' = '{}'::jsonb)))`)])
export const attemptProgress = pgTable('attempt_progress', {
  attemptId: uuid('attempt_id').primaryKey().references(() => attempts.id), status: text().notNull(), lastSequence: integer('last_sequence').notNull(),
  answers: integer().notNull(), correctAnswers: integer('correct_answers').notNull(), hints: integer().notNull(),
}, t => [check('progress_counts', sql`${t.answers} >= 0 AND ${t.correctAnswers} BETWEEN 0 AND ${t.answers} AND ${t.hints} >= 0 AND ${t.lastSequence} >= 1`), check('progress_status', sql`${t.status} IN ('active','completed','abandoned')`)])
