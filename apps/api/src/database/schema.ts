import { sql } from 'drizzle-orm'
import { bigint, bigserial, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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

// Catalog and bindings are immutable facts, not editable progress.
export const campaignVersions = pgTable('campaign_versions', {
  id: text().notNull(), version: text().notNull(), title: text().notNull(),
  definition: jsonb().notNull().$type<import('@mimix/contracts').CampaignDefinition>(),
}, t => [primaryKey({ columns: [t.id, t.version] })])
export const campaignAttempts = pgTable('campaign_attempts', {
  attemptId: uuid('attempt_id').primaryKey().references(() => attempts.id),
  campaignId: text('campaign_id').notNull(), campaignVersion: text('campaign_version').notNull(), nodeId: text('node_id').notNull(),
}, t => [foreignKey({ columns: [t.campaignId, t.campaignVersion], foreignColumns: [campaignVersions.id, campaignVersions.version] }),
  index('campaign_attempt_scope').on(t.campaignId, t.campaignVersion, t.attemptId)])


export const devicePairings = pgTable('device_pairings', {
  id: uuid().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id),
  identity: jsonb().notNull().$type<import('../modules/identity/identity.contract.js').VerifiedIdentity>(),
  sessionHash: text('session_hash').notNull(), codeHash: text('code_hash').notNull(), challenge: text().notNull(),
  capabilities: jsonb().notNull().$type<import('@mimix/robot-protocol').DeviceCapability[]>(),
  state: text().notNull(), failures: integer().notNull().default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(), expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, t => [index('device_pairing_owner').on(t.userId), index('device_pairing_expiry').on(t.state, t.expiresAt),
  check('device_pairing_state', sql`${t.state} IN ('pending','exchanged','cancelled','expired','locked')`),
  check('device_pairing_failures', sql`${t.failures} BETWEEN 0 AND 5`),
  check('device_pairing_secrets', sql`${t.codeHash} ~ '^[a-f0-9]{64}$' AND ${t.challenge} ~ '^[a-f0-9]{64}$' AND ${t.sessionHash} ~ '^[a-f0-9]{64}$'`)])
export const deviceSessions = pgTable('device_sessions', {
  id: uuid().primaryKey(), pairingId: uuid('pairing_id').notNull().unique().references(() => devicePairings.id),
  deviceId: uuid('device_id').notNull().unique(), userId: uuid('user_id').notNull().references(() => users.id),
  identity: jsonb().notNull().$type<import('../modules/identity/identity.contract.js').VerifiedIdentity>(),
  sessionHash: text('session_hash').notNull(), tokenHash: text('token_hash').notNull().unique(),
  capabilities: jsonb().notNull().$type<import('@mimix/robot-protocol').DeviceCapability[]>(), status: text().notNull(),
  lastSequence: bigint('last_sequence', { mode: 'number' }).notNull().default(0), lastSeenAt: bigint('last_seen_at', { mode: 'number' }),
  presenceExpiresAt: bigint('presence_expires_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(), expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, t => [index('device_session_owner').on(t.userId, t.id), index('device_session_expiry').on(t.status, t.presenceExpiresAt),
  check('device_session_status', sql`${t.status} IN ('active','revoked','expired','disconnected')`),
  check('device_session_sequence', sql`${t.lastSequence} BETWEEN 0 AND 9007199254740990`),
  check('device_session_secrets', sql`${t.tokenHash} ~ '^[a-f0-9]{64}$' AND ${t.sessionHash} ~ '^[a-f0-9]{64}$'`)])
export const deviceAudit = pgTable('device_audit', {
  id: bigserial({ mode: 'number' }).primaryKey(), userId: uuid('user_id').notNull().references(() => users.id),
  pairingId: uuid('pairing_id').references(() => devicePairings.id), sessionId: uuid('session_id').references(() => deviceSessions.id),
  event: text().notNull(), reason: text().notNull(), sequence: bigint({ mode: 'number' }),
  observedAt: bigint('observed_at', { mode: 'number' }).notNull(),
}, t => [index('device_audit_owner_page').on(t.userId, t.id)])


export const mediaSessions = pgTable('media_sessions', {
  id: uuid().primaryKey(), deviceSessionId: uuid('device_session_id').notNull().references(() => deviceSessions.id),
  userId: uuid('user_id').notNull().references(() => users.id), tracks: jsonb().notNull().$type<import('@mimix/media-contract').MediaTrack[]>(),
  state: text().notNull(), reason: text().notNull(), createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, t => [index('media_session_owner').on(t.userId, t.id), index('media_session_cleanup').on(t.state, t.expiresAt),
  uniqueIndex('media_device_open').on(t.deviceSessionId).where(sql`${t.state} <> 'closed'`),
  check('media_session_state', sql`${t.state} IN ('provisioning','active','closing','closed')`)])
