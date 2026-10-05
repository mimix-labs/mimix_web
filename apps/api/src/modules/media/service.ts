import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, lte, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { mediaRequestSchema, mediaSessionSchema, requiredDeviceCapabilities, participantPermissions, type MediaProvider, type MediaSession, type MediaTrack } from '@mimix/media-contract'
import type { Database, Transaction } from '../../database/database.js'
import { deviceSessions, mediaSessions } from '../../database/schema.js'
import type { DeviceActor } from '../devices/contract.js'
import type { DeviceAuthority, DeviceStore } from '../devices/store.js'
import type { MediaConfig } from './config.js'
export class MediaError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 503, message = 'media request denied') { super(message) }
}
export function parseMedia<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new MediaError(400, 'invalid media request')
  return result.data
}
const idSchema = z.uuid().transform(id => id.toLowerCase())
type Row = typeof mediaSessions.$inferSelect
const roomName = (id: string) => `mimix-media-${id}`
const identities = (id: string) => [`robot:${id}`, `user:${id}`]
export class MediaService {
  private cleanupCursor?: string
  private timer?: ReturnType<typeof setInterval>
  private sweeping?: Promise<void>
  constructor(private readonly database: Database, private readonly devices: DeviceStore, private readonly provider: MediaProvider, private readonly config: MediaConfig) {}
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { if (!this.sweeping) this.sweeping = this.sweep().catch(() => {}).finally(() => { this.sweeping = undefined }) }, 5000)
    this.timer.unref()
  }
  async shutdown(): Promise<void> { clearInterval(this.timer); this.timer = undefined; await this.sweeping }
  private transaction<T>(userId: string, action: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(104, hashtext(${userId}))`)
      return action(tx)
    })
  }
  private async now(tx: Transaction): Promise<number> {
    const result = await tx.execute(sql`select floor(extract(epoch from clock_timestamp()) * 1000)::text as ms`)
    return Number(result.rows[0].ms)
  }
  private view(row: Row, presenceExpiresAt: number): MediaSession {
    const session = { id: row.id, deviceSessionId: row.deviceSessionId, tracks: row.tracks, state: row.state, reason: row.reason, createdAt: row.createdAt, expiresAt: row.expiresAt }
    return mediaSessionSchema.parse({ schemaVersion: 1, ...session, leaseExpiresAt: row.state === 'active' ? Math.min(row.expiresAt, presenceExpiresAt) : 0 })
  }
  private fallback(tracks: MediaTrack[], authority: DeviceAuthority) {
    return this.config.lan && tracks.includes('robot_camera') && authority.capabilities.includes('camera:mjpeg')
      ? { transport: 'mjpeg' as const, scope: 'lan' as const, streamPath: '/api/vision/video' as const, authentication: 'operator' as const, audio: false as const } : null
  }
  async create(actor: DeviceActor, input: unknown) {
    const request = parseMedia(mediaRequestSchema, input)
    const pending = await this.devices.withUserSession(actor, request.deviceSessionId, requiredDeviceCapabilities(request.tracks), async (tx, authority) => {
      const [existing] = await tx.select().from(mediaSessions).where(and(eq(mediaSessions.deviceSessionId, authority.sessionId), ne(mediaSessions.state, 'closed')))
      if (existing) {
        const sameTracks = existing.tracks.length === request.tracks.length && request.tracks.every(track => existing.tracks.includes(track))
        if ((existing.state === 'provisioning' || existing.state === 'active') && existing.expiresAt > authority.now && sameTracks) return existing
        throw new MediaError(409, 'media session already exists')
      }
      const [row] = await tx.insert(mediaSessions).values({ id: randomUUID(), userId: authority.userId, deviceSessionId: authority.sessionId,
        tracks: request.tracks, state: 'provisioning', reason: 'NONE', createdAt: authority.now, expiresAt: Math.min(authority.now + 300000, authority.expiresAt) }).returning()
      return row
    })
    // Commit the cleanup intent before any remote side effect, including process death.
    return this.devices.withUserSession(actor, pending.deviceSessionId, requiredDeviceCapabilities(pending.tracks), async (tx, authority) => {
      const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, pending.id)).for('update')
      return this.join(tx, row, authority, 'user', true)
    })
  }
  private async join(tx: Transaction, row: Row, authority: DeviceAuthority, participant: 'user' | 'robot', create = false) {
    if ((row.state !== 'active' && !(create && row.state === 'provisioning')) || row.expiresAt <= authority.now) throw new MediaError(401)
    const permissions = participantPermissions(row.tracks, participant), identity = `${participant}:${row.id}`, room = roomName(row.id)
    try {
      if (row.state === 'provisioning') {
        // Deterministic room name + idempotent provider create recover a crash after
        // the remote effect but before this transaction commits. No lease until ready.
        await this.provider.createRoom(room)
        const [active] = await tx.update(mediaSessions).set({ state: 'active' }).where(eq(mediaSessions.id, row.id)).returning()
        row = active
      }
      const credentials = await this.provider.issueToken({ room, identity, permissions, expiresAt: Math.min(authority.now + 30000, authority.presenceExpiresAt, authority.expiresAt, row.expiresAt) })
      if (credentials.expiresAt <= await this.now(tx) || credentials.expiresAt > Math.min(authority.presenceExpiresAt, row.expiresAt)) throw new Error()
      return { status: 'ready' as const, session: this.view(row, authority.presenceExpiresAt), connection: { provider: 'livekit' as const,
        url: this.config.url, room, identity, ...credentials, permissions, revocation: this.config.mode === 'cloud' ? 'provider-managed' : 'best-effort' } }
    } catch {
      const [closing] = await tx.update(mediaSessions).set({ state: 'closing', reason: 'PROVIDER_UNAVAILABLE' }).where(eq(mediaSessions.id, row.id)).returning()
      return { status: 'degraded' as const, session: this.view(closing, 0), reason: 'PROVIDER_UNAVAILABLE' as const,
        fallback: participant === 'user' ? this.fallback(row.tracks, authority) : null }
    }
  }
  private async load(id: string, userId?: string): Promise<Row> {
    const mediaId = parseMedia(idSchema, id)
    const [row] = await this.database.db.select().from(mediaSessions).where(and(eq(mediaSessions.id, mediaId), userId ? eq(mediaSessions.userId, userId) : undefined))
    if (!row) throw new MediaError(404, 'media session not found')
    return row
  }
  async issueUser(actor: DeviceActor, id: string) {
    const hint = await this.load(id, actor.userId)
    return this.devices.withUserSession(actor, hint.deviceSessionId, requiredDeviceCapabilities(hint.tracks), async (tx, authority) => {
      const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
      return this.join(tx, row, authority, 'user')
    })
  }
  async issueRobot(token: string, id: string) {
    const hint = await this.load(id)
    return this.devices.withDeviceSession(token, hint.deviceSessionId, requiredDeviceCapabilities(hint.tracks), async (tx, authority) => {
      const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
      return this.join(tx, row, authority, 'robot')
    })
  }
  private async reconcile(tx: Transaction, row: Row): Promise<{ row: Row; presence: number }> {
    const [device] = await tx.select().from(deviceSessions).where(eq(deviceSessions.id, row.deviceSessionId))
    const now = await this.now(tx)
    const ended = device.status !== 'active' || device.expiresAt <= now || device.presenceExpiresAt <= now
    if ((row.state === 'active' || row.state === 'provisioning') && (ended || row.expiresAt <= now)) {
      const [updated] = await tx.update(mediaSessions).set({ state: 'closing', reason: ended ? 'DEVICE_ENDED' : 'SESSION_EXPIRED' }).where(eq(mediaSessions.id, row.id)).returning()
      row = updated
    }
    return { row, presence: ended ? 0 : device.presenceExpiresAt }
  }
  async get(userId: string, id: string): Promise<MediaSession> {
    const hint = await this.load(id, userId)
    return this.transaction(userId, async tx => {
      const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
      const state = await this.reconcile(tx, row)
      return this.view(state.row, state.presence)
    })
  }
  async list(userId: string, after?: string) {
    const cursor = after ? parseMedia(idSchema, after) : undefined
    const rows = await this.database.db.select({ id: mediaSessions.id }).from(mediaSessions).where(and(eq(mediaSessions.userId, userId), cursor ? gt(mediaSessions.id, cursor) : undefined))
      .orderBy(asc(mediaSessions.id)).limit(51)
    const items: MediaSession[] = []
    for (const row of rows.slice(0, 50)) items.push(await this.get(userId, row.id))
    return { items, nextCursor: rows.length > 50 ? rows[49].id : null }
  }
  async close(userId: string, id: string): Promise<MediaSession> {
    const hint = await this.load(id, userId)
    const row = await this.transaction(userId, async tx => {
      const [current] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
      if (current.state !== 'active' && current.state !== 'provisioning') return current
      const [closing] = await tx.update(mediaSessions).set({ state: 'closing', reason: 'USER_CLOSED' }).where(eq(mediaSessions.id, current.id)).returning()
      return closing
    })
    await this.cleanup(row)
    return this.get(userId, id)
  }
  async disconnect(token: string, id: string): Promise<MediaSession> {
    const hint = await this.load(id)
    const closing = await this.devices.withDeviceSession(token, hint.deviceSessionId, [], async tx => {
      const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
      if (row.state !== 'active' && row.state !== 'provisioning') return row
      const [updated] = await tx.update(mediaSessions).set({ state: 'closing', reason: 'DISCONNECTED' }).where(eq(mediaSessions.id, row.id)).returning()
      return updated
    })
    await this.cleanup(closing)
    return this.get(hint.userId, id)
  }
  private async cleanup(row: Row): Promise<void> {
    if (row.state !== 'closing') return
    try { await this.provider.closeRoom(roomName(row.id), identities(row.id)) } catch { return }
    await this.transaction(row.userId, async tx => {
      await tx.update(mediaSessions).set({ state: 'closed' }).where(and(eq(mediaSessions.id, row.id), eq(mediaSessions.state, 'closing')))
    })
  }
  async sweep(): Promise<void> {
    const now = sql`floor(extract(epoch from clock_timestamp()) * 1000)`
    const candidates = await this.database.db.select({ row: mediaSessions }).from(mediaSessions).innerJoin(deviceSessions, eq(mediaSessions.deviceSessionId, deviceSessions.id))
      .where(and(this.cleanupCursor ? gt(mediaSessions.id, this.cleanupCursor) : undefined, or(eq(mediaSessions.state, 'closing'), and(or(eq(mediaSessions.state, 'active'), eq(mediaSessions.state, 'provisioning')), or(lte(mediaSessions.expiresAt, now), ne(deviceSessions.status, 'active'), lte(deviceSessions.expiresAt, now), lte(deviceSessions.presenceExpiresAt, now))))))
      .orderBy(asc(mediaSessions.id)).limit(100)
    this.cleanupCursor = candidates.length === 100 ? candidates.at(-1)!.row.id : undefined
    // Bounded concurrency; one unavailable room cannot monopolize the worker.
    for (let offset = 0; offset < candidates.length; offset += 8) await Promise.all(candidates.slice(offset, offset + 8).map(async ({ row: hint }) => {
      const row = await this.transaction(hint.userId, async tx => {
        const [row] = await tx.select().from(mediaSessions).where(eq(mediaSessions.id, hint.id)).for('update')
        return (await this.reconcile(tx, row)).row
      })
      await this.cleanup(row)
    }))
  }
}
