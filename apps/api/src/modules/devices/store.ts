import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, gt, lte, or, sql } from 'drizzle-orm'
import {
  devicePairingRequestSchema, deviceExchangeRequestSchema, deviceHeartbeatSchema,
  deviceAuthorizationSchema, deviceSessionSchema, supportedDeviceCapabilities, type DeviceSession,
} from '@mimix/robot-protocol'
import type { Database, Transaction } from '../../database/database.js'
import { devicePairings, deviceSessions, deviceAudit } from '../../database/schema.js'
import type { VerifiedIdentity } from '../identity/identity.contract.js'
import { DeviceError, deviceId, deviceToken, parseDevice, type DeviceActor } from './contract.js'

type Pairing = typeof devicePairings.$inferSelect
type Session = typeof deviceSessions.$inferSelect
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const identityHash = (value: VerifiedIdentity) => hash(JSON.stringify([value.provider, value.issuer, value.subject, value.sessionId]))
const equalHash = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
const PAIR_TTL = 300000, SESSION_TTL = 900000, PRESENCE_TTL = 30000

/** PostgreSQL is the authority; no credential or revocation cache across requests. */
export class DeviceStore {
  private timer?: ReturnType<typeof setInterval>
  private sweeping?: Promise<void>
  constructor(private readonly database: Database, private readonly verifySession: (identity: VerifiedIdentity) => Promise<void>) {}
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (!this.sweeping) this.sweeping = this.sweep().catch(() => {}).finally(() => { this.sweeping = undefined })
    }, 1000)
    this.timer.unref()
  }
  async close(): Promise<void> { clearInterval(this.timer); this.timer = undefined; await this.sweeping }
  private async transaction<T>(userId: string, action: (tx: Transaction) => Promise<T | DeviceError>): Promise<T> {
    // Acquire before any row lock. This also orders audit allocation AND commit per owner.
    const result = await this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(104, hashtext(${userId}))`)
      return action(tx)
    })
    // Denials that change state/audit must commit before returning an error.
    if (result instanceof DeviceError) throw result
    return result
  }
  private async now(tx: Transaction): Promise<number> {
    const result = await tx.execute(sql`select floor(extract(epoch from clock_timestamp()) * 1000)::text as ms`)
    return Number(result.rows[0].ms)
  }
  private async auditEvent(tx: Transaction, row: Pairing | Session, event: string, reason: string, now: number, sequence?: number): Promise<void> {
    await tx.insert(deviceAudit).values({ userId: row.userId, pairingId: 'pairingId' in row ? row.pairingId : row.id,
      sessionId: 'tokenHash' in row ? row.id : null, event, reason, sequence, observedAt: now })
  }
  private async origin(identity: VerifiedIdentity): Promise<DeviceError | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([this.verifySession(identity), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DeviceError(503)), 3000)
      })])
      return undefined
    } catch (error) { return new DeviceError((error as { status?: number })?.status === 401 ? 401 : 503, 'device identity unavailable') }
    finally { clearTimeout(timer) }
  }
  private async expire(tx: Transaction, row: Session, now: number): Promise<Session> {
    if (row.status === 'active' && (row.expiresAt <= now || row.presenceExpiresAt <= now)) {
      const [expired] = await tx.update(deviceSessions).set({ status: 'expired' }).where(eq(deviceSessions.id, row.id)).returning()
      await this.auditEvent(tx, expired, 'expired', row.expiresAt <= now ? 'session_ttl' : 'heartbeat_timeout', now)
      return expired
    }
    return row
  }
  private async active(tx: Transaction, row: Session): Promise<{ row: Session; now: number } | DeviceError> {
    row = await this.expire(tx, row, await this.now(tx))
    if (row.status !== 'active') return new DeviceError(401)
    const origin = await this.origin(row.identity)
    const now = await this.now(tx)
    if (origin) {
      if (origin.status === 401) {
        await tx.update(deviceSessions).set({ status: 'revoked' }).where(eq(deviceSessions.id, row.id))
        await this.auditEvent(tx, row, 'revoked', 'identity_revoked', now)
      }
      return origin
    }
    row = await this.expire(tx, row, now)
    return row.status === 'active' ? { row, now } : new DeviceError(401)
  }
  private view(row: Session, now: number): DeviceSession {
    return deviceSessionSchema.parse({ schemaVersion: 1, id: row.id, deviceId: row.deviceId, capabilities: row.capabilities,
      status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, nextSequence: row.lastSequence + 1,
      presence: row.lastSeenAt === null ? null : { schemaVersion: 1, deviceId: row.deviceId, connectionId: row.id,
        sequence: row.lastSequence, state: row.status === 'active' && row.presenceExpiresAt > now ? 'online' : 'offline',
        observedAt: row.lastSeenAt, expiresAt: row.presenceExpiresAt } })
  }
  async createPairing(actor: DeviceActor, value: unknown) {
    const input = parseDevice(devicePairingRequestSchema, value)
    return this.transaction(actor.userId, async tx => {
      const now = await this.now(tx)
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(devicePairings)
        .where(and(eq(devicePairings.userId, actor.userId), eq(devicePairings.state, 'pending'), gt(devicePairings.expiresAt, now)))
      if (count.n >= 10) return new DeviceError(429, 'pairing limit reached')
      const code = randomBytes(16).toString('base64url')
      const [row] = await tx.insert(devicePairings).values({ id: randomUUID(), userId: actor.userId, identity: actor.identity,
        sessionHash: identityHash(actor.identity), codeHash: hash(code), challenge: input.challenge,
        capabilities: input.capabilities, state: 'pending', createdAt: now, expiresAt: now + PAIR_TTL }).returning()
      await this.auditEvent(tx, row, 'pairing_created', 'owner_approved', now)
      return { schemaVersion: 1, id: row.id, code, createdAt: now, expiresAt: row.expiresAt }
    })
  }
  async exchange(value: unknown): Promise<{ token: string; session: DeviceSession }> {
    const input = parseDevice(deviceExchangeRequestSchema, value)
    const [hint] = await this.database.db.select({ userId: devicePairings.userId }).from(devicePairings).where(eq(devicePairings.id, input.pairingId))
    if (!hint) throw new DeviceError(401)
    return this.transaction(hint.userId, async tx => {
      const [pair] = await tx.select().from(devicePairings).where(eq(devicePairings.id, input.pairingId)).for('update')
      let now = await this.now(tx)
      if (pair.state !== 'pending') {
        if (equalHash(hash(input.code), pair.codeHash) && equalHash(hash(input.verifier), pair.challenge))
          await this.auditEvent(tx, pair, 'pairing_denied', 'pairing_replay', now)
        return new DeviceError(401)
      }
      if (pair.expiresAt <= now) {
        await tx.update(devicePairings).set({ state: 'expired' }).where(eq(devicePairings.id, pair.id))
        await this.auditEvent(tx, pair, 'pairing_expired', 'pairing_ttl', now)
        return new DeviceError(401)
      }
      const codeMatches = equalHash(hash(input.code), pair.codeHash), proofMatches = equalHash(hash(input.verifier), pair.challenge)
      if (!codeMatches || !proofMatches) {
        const failures = pair.failures + 1
        await tx.update(devicePairings).set({ failures, state: failures >= 5 ? 'locked' : 'pending' }).where(eq(devicePairings.id, pair.id))
        await this.auditEvent(tx, pair, 'pairing_denied', failures >= 5 ? 'attempt_limit' : 'invalid_proof', now)
        return new DeviceError(401)
      }
      if (!pair.capabilities.every(cap => supportedDeviceCapabilities(input.capabilities).includes(cap))) {
        await this.auditEvent(tx, pair, 'pairing_denied', 'unsupported_capability', now)
        return new DeviceError(403)
      }
      const origin = await this.origin(pair.identity)
      now = await this.now(tx)
      if (origin || pair.expiresAt <= now) {
        if (origin?.status !== 503) {
          await tx.update(devicePairings).set({ state: 'expired' }).where(eq(devicePairings.id, pair.id))
          await this.auditEvent(tx, pair, 'pairing_expired', origin ? 'identity_revoked' : 'pairing_ttl', now)
        }
        return origin ?? new DeviceError(401)
      }
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(deviceSessions)
        .where(and(eq(deviceSessions.userId, pair.userId), eq(deviceSessions.status, 'active'), gt(deviceSessions.expiresAt, now), gt(deviceSessions.presenceExpiresAt, now)))
      if (count.n >= 5) return new DeviceError(429, 'device session limit reached')
      const token = randomBytes(32).toString('base64url')
      const [session] = await tx.insert(deviceSessions).values({ id: randomUUID(), pairingId: pair.id, deviceId: randomUUID(),
        userId: pair.userId, identity: pair.identity, sessionHash: pair.sessionHash, tokenHash: hash(token), capabilities: pair.capabilities,
        status: 'active', createdAt: now, expiresAt: now + SESSION_TTL, presenceExpiresAt: now + PRESENCE_TTL }).returning()
      await tx.update(devicePairings).set({ state: 'exchanged' }).where(eq(devicePairings.id, pair.id))
      await this.auditEvent(tx, session, 'paired', 'proof_verified', now)
      return { token, session: this.view(session, now) }
    })
  }
  private async forToken<T>(token: string, action: (tx: Transaction, row: Session, now: number) => Promise<T | DeviceError>): Promise<T> {
    if (!deviceToken.safeParse(token).success) throw new DeviceError(401)
    const [hint] = await this.database.db.select({ userId: deviceSessions.userId }).from(deviceSessions).where(eq(deviceSessions.tokenHash, hash(token)))
    if (!hint) throw new DeviceError(401)
    return this.transaction(hint.userId, async tx => {
      const [row] = await tx.select().from(deviceSessions).where(eq(deviceSessions.tokenHash, hash(token))).for('update')
      if (!row) return new DeviceError(401)
      const current = await this.active(tx, row)
      return current instanceof DeviceError ? current : action(tx, current.row, current.now)
    })
  }
  /** Quota identity only. Operations recheck all authority under transaction locks. */
  async credentialSessionId(token: string): Promise<string | undefined> {
    if (!deviceToken.safeParse(token).success) return undefined
    const [row] = await this.database.db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(
      eq(deviceSessions.tokenHash, hash(token)), eq(deviceSessions.status, 'active'),
      gt(deviceSessions.expiresAt, sql`floor(extract(epoch from clock_timestamp()) * 1000)`),
      gt(deviceSessions.presenceExpiresAt, sql`floor(extract(epoch from clock_timestamp()) * 1000)`)))
    return row?.id
  }
  self(token: string): Promise<DeviceSession> { return this.forToken(token, async (_tx, row, now) => this.view(row, now)) }
  heartbeat(token: string, value: unknown): Promise<DeviceSession> { return this.updatePresence(token, value, false) }
  disconnect(token: string, value: unknown): Promise<DeviceSession> { return this.updatePresence(token, value, true) }
  private updatePresence(token: string, value: unknown, disconnect: boolean): Promise<DeviceSession> {
    const input = parseDevice(deviceHeartbeatSchema, value)
    return this.forToken(token, async (tx, row, now) => {
      if (input.sequence !== row.lastSequence + 1) {
        await this.auditEvent(tx, row, 'denied', 'sequence_conflict', now)
        return new DeviceError(409, 'device sequence conflict')
      }
      if (!row.capabilities.includes('presence:heartbeat')) return new DeviceError(403)
      const [updated] = await tx.update(deviceSessions).set({ lastSequence: input.sequence, lastSeenAt: now,
        presenceExpiresAt: Math.min(now + PRESENCE_TTL, row.expiresAt), status: disconnect ? 'disconnected' : 'active' })
        .where(eq(deviceSessions.id, row.id)).returning()
      await this.auditEvent(tx, row, disconnect ? 'disconnected' : 'heartbeat', disconnect ? 'device_requested' : 'received', now, input.sequence)
      return this.view(updated, now)
    })
  }
  async authorize(actor: DeviceActor, id: string, value: unknown) {
    const input = parseDevice(deviceAuthorizationSchema, value), sessionId = parseDevice(deviceId, id)
    return this.transaction(actor.userId, async tx => {
      const [row] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, actor.userId))).for('update')
      if (!row) return new DeviceError(404, 'device session not found')
      if (!equalHash(identityHash(actor.identity), row.sessionHash) || !row.capabilities.includes(input.capability)) {
        await this.auditEvent(tx, row, 'denied', 'scope_mismatch', await this.now(tx))
        return new DeviceError(403)
      }
      const current = await this.active(tx, row)
      if (current instanceof DeviceError) return current
      if (row.lastSeenAt === null) return new DeviceError(403, 'device is not present')
      await this.auditEvent(tx, row, 'authorized', input.capability, current.now)
      // Observation only; future dispatchers must call this at operation time.
      return { authorized: true, sessionId: row.id, deviceId: row.deviceId, capability: input.capability,
        expiresAt: Math.min(row.expiresAt, row.presenceExpiresAt) }
    })
  }
  async get(userId: string, id: string): Promise<DeviceSession> {
    const sessionId = parseDevice(deviceId, id)
    return this.transaction(userId, async tx => {
      const [row] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId))).for('update')
      if (!row) return new DeviceError(404, 'device session not found')
      const now = await this.now(tx)
      return this.view(await this.expire(tx, row, now), now)
    })
  }
  async revoke(userId: string, id: string): Promise<DeviceSession> {
    const sessionId = parseDevice(deviceId, id)
    return this.transaction(userId, async tx => {
      const [row] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId))).for('update')
      if (!row) return new DeviceError(404, 'device session not found')
      const now = await this.now(tx)
      if (row.status === 'active') {
        await tx.update(deviceSessions).set({ status: 'revoked' }).where(eq(deviceSessions.id, row.id))
        await this.auditEvent(tx, row, 'revoked', 'owner_requested', now)
        row.status = 'revoked'
      }
      return this.view(row, now)
    })
  }
  async cancelPairing(userId: string, id: string) {
    const pairingId = parseDevice(deviceId, id)
    return this.transaction(userId, async tx => {
      const [row] = await tx.select().from(devicePairings).where(and(eq(devicePairings.id, pairingId), eq(devicePairings.userId, userId))).for('update')
      if (!row) return new DeviceError(404, 'pairing not found')
      if (row.state === 'pending') {
        await tx.update(devicePairings).set({ state: 'cancelled' }).where(eq(devicePairings.id, row.id))
        await this.auditEvent(tx, row, 'pairing_cancelled', 'owner_requested', await this.now(tx))
      }
      return { cancelled: row.state === 'pending' || row.state === 'cancelled' }
    })
  }
  async list(userId: string, after?: string) {
    const cursor = after === undefined ? undefined : parseDevice(deviceId, after)
    const rows = await this.database.db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.userId, userId), cursor ? gt(deviceSessions.id, cursor) : undefined)).orderBy(asc(deviceSessions.id)).limit(51)
    return { items: await Promise.all(rows.slice(0, 50).map(row => this.get(userId, row.id))), nextCursor: rows.length > 50 ? rows[49].id : null }
  }
  async audit(userId: string, after = '0') {
    if (!/^\d{1,16}$/.test(after) || !Number.isSafeInteger(Number(after))) throw new DeviceError(400, 'invalid cursor')
    const rows = await this.database.db.select({ id: deviceAudit.id, pairingId: deviceAudit.pairingId, sessionId: deviceAudit.sessionId,
      event: deviceAudit.event, reason: deviceAudit.reason, sequence: deviceAudit.sequence, observedAt: deviceAudit.observedAt })
      .from(deviceAudit).where(and(eq(deviceAudit.userId, userId), gt(deviceAudit.id, Number(after)))).orderBy(asc(deviceAudit.id)).limit(51)
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? String(rows[49].id) : null }
  }
  async sweep(): Promise<void> {
    // Select candidate owners without locks, then follow the same owner-before-row order.
    // Each short batch commits separately so one owner's audit never overtakes its commit.
    const cutoff = sql`floor(extract(epoch from clock_timestamp()) * 1000)`
    const pending = await this.database.db.select({ userId: devicePairings.userId }).from(devicePairings)
      .where(and(eq(devicePairings.state, 'pending'), lte(devicePairings.expiresAt, cutoff))).limit(100)
    const silent = await this.database.db.select({ userId: deviceSessions.userId }).from(deviceSessions)
      .where(and(eq(deviceSessions.status, 'active'), or(lte(deviceSessions.expiresAt, cutoff), lte(deviceSessions.presenceExpiresAt, cutoff)))).limit(100)
    for (const userId of new Set([...pending, ...silent].map(row => row.userId))) {
      await this.transaction(userId, async tx => {
        const now = await this.now(tx)
        const pairings = await tx.select().from(devicePairings).where(and(eq(devicePairings.userId, userId), eq(devicePairings.state, 'pending'), lte(devicePairings.expiresAt, now)))
          .orderBy(asc(devicePairings.id)).limit(100).for('update', { skipLocked: true })
        for (const pair of pairings) {
          await tx.update(devicePairings).set({ state: 'expired' }).where(eq(devicePairings.id, pair.id))
          await this.auditEvent(tx, pair, 'pairing_expired', 'pairing_ttl', now)
        }
        const sessions = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.userId, userId), eq(deviceSessions.status, 'active'), or(lte(deviceSessions.expiresAt, now), lte(deviceSessions.presenceExpiresAt, now))))
          .orderBy(asc(deviceSessions.id)).limit(100).for('update', { skipLocked: true })
        for (const row of sessions) await this.expire(tx, row, now)
      })
    }
  }
}
