import type { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { offlineEventSchema, offlineAttemptSchema, offlineAppendSchema, syncBatchSchema, syncBindingSchema, syncReceiptSchema, type OfflineAttempt, type OfflineEvent, type SyncBatch } from '@mimix/contracts'
import { digest, parseSync, SyncError } from './contract.js'

type Session = { id: string; claim_key: string; sealed: number; user_id: string | null; cloud_time: number }
type Attempt = { id: string; session_id: string; started_event_id: string; challenge_id: string; challenge_version: string; last_sequence: number; state: string }
type EventRow = { id: string; sequence: number; content: string | null; hash: string }
const secret = () => randomBytes(32).toString('base64url')
const retention = 30 * 86400000

/** Local receipts are not cloud authority. Only SyncService may accept cloud ACKs. */
export class LocalStore {
  private readonly db: DatabaseSync
  private closed = false
  private readonly now: () => number
  constructor(readonly path: string, private readonly options: { now?: () => number; maxEvents?: number; maxSessions?: number } = {}) {
    if (!isAbsolute(path)) throw new SyncError(503, 'offline storage unavailable')
    this.now = options.now ?? Date.now
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const existingFile = existsSync(path)
    this.db = new DatabaseSync(path)
    try {
      chmodSync(path, 0o600)
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
      if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Integrity failure')
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version
      if ((existingFile && version !== 1) || (version !== 0 && version !== 1)) throw new Error('Unsupported schema')
      if (existingFile) {
        // Only a brand-new file may initialize schema. Never repair by omission.
        this.db.prepare('SELECT id,token_hash,claim_key,sealed,user_id,cloud_time FROM sessions LIMIT 0').all()
        this.db.prepare('SELECT id,session_id,started_event_id,challenge_id,challenge_version,last_sequence,state FROM attempts LIMIT 0').all()
        this.db.prepare('SELECT id,attempt_id,sequence,content,hash,local_time,acknowledged,ack_time FROM events LIMIT 0').all()
        if (this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Integrity failure')
      }
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA journal_size_limit=8388608;')
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, claim_key TEXT NOT NULL, sealed INTEGER NOT NULL DEFAULT 0, user_id TEXT, cloud_time INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), started_event_id TEXT NOT NULL UNIQUE, challenge_id TEXT NOT NULL, challenge_version TEXT NOT NULL, last_sequence INTEGER NOT NULL, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), sequence INTEGER NOT NULL, content TEXT, hash TEXT NOT NULL, local_time INTEGER NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, ack_time INTEGER, UNIQUE(attempt_id,sequence));
        CREATE INDEX IF NOT EXISTS attempt_session ON attempts(session_id,id);
        CREATE INDEX IF NOT EXISTS pending_events ON events(acknowledged,attempt_id,sequence);
        PRAGMA user_version=1; COMMIT;`)
    } catch (error) { this.db.close(); throw error }
  }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = action(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private session(token: string): Session {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new SyncError(401, 'invalid local session')
    const row = this.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(digest(token)) as Session | undefined
    if (!row) throw new SyncError(401, 'invalid local session')
    return row
  }
  private writable(session: Session) { if (session.sealed) throw new SyncError(409, 'local session sealed') }
  private capacity(table: 'sessions' | 'events', limit: number) {
    if (Number(this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count) >= limit) throw new SyncError(507, 'offline storage full')
  }
  createSession() {
    return this.transaction(() => {
      this.capacity('sessions', this.options.maxSessions ?? 1000)
      const sessionId = randomUUID(), token = secret()
      this.db.prepare('INSERT INTO sessions(id,token_hash,claim_key) VALUES(?,?,?)').run(sessionId, digest(token), secret())
      return { sessionId, token }
    })
  }
  createAttempt(token: string, value: unknown) {
    const input = parseSync(offlineAttemptSchema, value)
    return this.transaction(() => {
      const session = this.session(token)
      const existing = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(input.attemptId) as Attempt | undefined
      if (existing) {
        if (existing.session_id !== session.id || existing.started_event_id !== input.startedEventId || existing.challenge_id !== input.challengeId || existing.challenge_version !== input.challengeVersion) throw new SyncError(409, 'attempt conflict')
        return { attemptId: existing.id, duplicate: true, lastSequence: existing.last_sequence }
      }
      this.writable(session); this.capacity('events', this.options.maxEvents ?? 10000)
      if (this.db.prepare('SELECT id FROM events WHERE id=?').get(input.startedEventId)) throw new SyncError(409, 'event conflict')
      this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,1,?)').run(input.attemptId, session.id, input.startedEventId, input.challengeId, input.challengeVersion, 'active')
      this.insertEvent(input.attemptId, { eventId: input.startedEventId, sequence: 1, type: 'attempt_started', payload: {} })
      return { attemptId: input.attemptId, duplicate: false, lastSequence: 1 }
    })
  }
  private insertEvent(attemptId: string, event: OfflineEvent) {
    const content = JSON.stringify(event)
    this.db.prepare('INSERT INTO events(id,attempt_id,sequence,content,hash,local_time) VALUES(?,?,?,?,?,?)').run(event.eventId, attemptId, event.sequence, content, digest(content), this.now())
  }
  append(token: string, value: unknown) {
    const input = parseSync(offlineAppendSchema, value)
    return this.transaction(() => {
      const session = this.session(token)
      const attempt = this.db.prepare('SELECT * FROM attempts WHERE id=? AND session_id=?').get(input.attemptId, session.id) as Attempt | undefined
      if (!attempt) throw new SyncError(404, 'local attempt not found')
      const existing = this.db.prepare('SELECT * FROM events WHERE id=?').get(input.event.eventId) as (EventRow & { attempt_id: string }) | undefined
      if (existing) {
        if (existing.attempt_id !== attempt.id || existing.hash !== digest(JSON.stringify(input.event))) throw new SyncError(409, 'event conflict')
        return { eventId: existing.id, duplicate: true }
      }
      this.writable(session)
      if (attempt.state !== 'active' || input.event.sequence !== attempt.last_sequence + 1) throw new SyncError(409, 'attempt closed or sequence conflict')
      this.capacity('events', this.options.maxEvents ?? 10000)
      this.insertEvent(attempt.id, input.event)
      const state = input.event.type === 'attempt_completed' ? 'completed' : input.event.type === 'attempt_abandoned' ? 'abandoned' : 'active'
      this.db.prepare('UPDATE attempts SET last_sequence=?,state=? WHERE id=?').run(input.event.sequence, state, attempt.id)
      return { eventId: input.event.eventId, duplicate: false }
    })
  }
  status(token: string) {
    const s = this.session(token)
    const pending = this.db.prepare('SELECT count(*) AS count FROM events e JOIN attempts a ON a.id=e.attempt_id WHERE a.session_id=? AND e.acknowledged=0').get(s.id)
    return { sessionId: s.id, sealed: !!s.sealed, userId: s.user_id, pendingEvents: Number(pending?.count),
      state: !s.user_id ? 'login_required' : Number(pending?.count) ? 'pending' : 'synchronized',
      unavailableOffline: ['clerk_login', 'cloud_voice', 'cloud_llm', 'cloud_campaign_unlocks'] }
  }
  seal(token: string) {
    return this.transaction(() => {
      const s = this.session(token)
      this.db.prepare('UPDATE sessions SET sealed=1 WHERE id=?').run(s.id)
      return { sessionId: s.id, claimKey: s.claim_key, userId: s.user_id }
    })
  }
  bind(token: string, value: unknown) {
    const input = parseSync(syncBindingSchema, value)
    this.transaction(() => {
      const s = this.session(token)
      if (!s.sealed || input.sessionId !== s.id || (s.user_id && input.userId !== s.user_id)) throw new SyncError(409, 'binding conflict')
      this.db.prepare('UPDATE sessions SET user_id=?,cloud_time=max(cloud_time,?) WHERE id=?').run(input.userId, input.serverTime, s.id)
    })
  }
  batch(token: string): SyncBatch | null {
    const s = this.session(token)
    if (!s.user_id || !s.sealed) throw new SyncError(409, 'local session not linked')
    const a = this.db.prepare('SELECT a.* FROM attempts a WHERE a.session_id=? AND EXISTS(SELECT 1 FROM events e WHERE e.attempt_id=a.id AND e.acknowledged=0) ORDER BY a.id LIMIT 1').get(s.id) as Attempt | undefined
    if (!a) return null
    const rows = this.db.prepare('SELECT * FROM events WHERE attempt_id=? AND acknowledged=0 ORDER BY sequence LIMIT 50').all(a.id) as EventRow[]
    const attempt: OfflineAttempt = { attemptId: a.id, startedEventId: a.started_event_id, challengeId: a.challenge_id, challengeVersion: a.challenge_version }
    return parseSync(syncBatchSchema, { sessionId: s.id, claimKey: s.claim_key, attempt, events: rows.map(row => {
      try {
        if (row.content === null || digest(row.content) !== row.hash) throw new Error()
        const event = offlineEventSchema.parse(JSON.parse(row.content))
        if (event.eventId !== row.id || event.sequence !== row.sequence) throw new Error()
        return event
      } catch { throw new SyncError(503, 'offline storage unavailable') }
    }) })
  }
  acknowledge(token: string, batch: SyncBatch, value: unknown) {
    const receipt = parseSync(syncReceiptSchema, value)
    this.transaction(() => {
      const s = this.session(token)
      if (receipt.sessionId !== s.id || receipt.userId !== s.user_id || batch.sessionId !== s.id || receipt.attemptId !== batch.attempt.attemptId || !isDeepStrictEqual(receipt.events, batch.events.map(({ eventId, sequence }) => ({ eventId, sequence })))) throw new SyncError(409, 'receipt conflict')
      for (const event of batch.events) {
        const existing = this.db.prepare('SELECT * FROM events WHERE id=? AND attempt_id=?').get(event.eventId, batch.attempt.attemptId) as EventRow | undefined
        if (!existing || existing.hash !== digest(JSON.stringify(event))) throw new SyncError(409, 'receipt conflict')
        this.db.prepare('UPDATE events SET acknowledged=1,ack_time=coalesce(ack_time,?) WHERE id=?').run(receipt.serverTime, event.eventId)
      }
      this.db.prepare('UPDATE sessions SET cloud_time=max(cloud_time,?) WHERE id=?').run(receipt.serverTime, s.id)
    })
  }
  prune(token: string): number {
    return this.transaction(() => {
      const s = this.session(token)
      return Number(this.db.prepare('UPDATE events SET content=NULL WHERE acknowledged=1 AND content IS NOT NULL AND ack_time<=? AND attempt_id IN(SELECT id FROM attempts WHERE session_id=?)').run(s.cloud_time - retention, s.id).changes)
    })
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true } }
}
