import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { robotControlRequestSchema, robotLeaseRequestSchema, robotControlSessionSchema, robotCommandViewSchema, robotControlEnvelopeSchema,
  robotControlAckSchema, robotGatewayPresenceSchema, type RobotControlTransport, type RobotTransportEvent, type RobotGatewayPresence } from '@mimix/robot-protocol'
import type { Database, Transaction } from '../../database/database.js'
import { robotControlSessions as sessions, robotCommands as commands, robotControlAudit as audit, deviceSessions } from '../../database/schema.js'
import { DeviceError, deviceId, parseDevice, type DeviceActor } from '../devices/contract.js'
import type { DeviceStore } from '../devices/store.js'
import type { EmbodimentSessions } from '../embodiments/sessions.js'
import { ControlLeader } from './leader.js'
type Session = typeof sessions.$inferSelect
type Command = typeof commands.$inferSelect
const pending = ['prepared', 'published']
export class RobotControlService {
  private readonly leader: ControlLeader
  private readonly presence = new Map<string, { value: RobotGatewayPresence; received: number }>()
  private events: Promise<void> = Promise.resolve()
  private timer?: ReturnType<typeof setInterval>
  private sweeping?: Promise<void>
  private ready?: Promise<void>
  private closed = false
  constructor(private readonly database: Database, private readonly devices: DeviceStore, private readonly embodiments: EmbodimentSessions,
    private readonly transport: RobotControlTransport, private readonly onLeaderLost: () => void = () => embodiments.close()) {
    this.leader = new ControlLeader(database, () => {
      this.closed = true; this.presence.clear(); clearInterval(this.timer)
      this.onLeaderLost(); void this.transport.close()
    })
  }
  start(): Promise<void> { return this.ready ??= this.initialize() }
  private async initialize(): Promise<void> {
    await this.leader.start()
    try {
      // Recovery only closes records; it never republishes an uncertain command.
      const owners = await this.database.db.selectDistinct({ userId: sessions.userId }).from(sessions).where(eq(sessions.state, 'active'))
      for (const { userId } of owners) await this.transaction(userId, async tx => {
        const rows = await tx.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.state, 'active')))
        for (const row of rows) await this.closeRow(tx, row, 'RESTART')
      })
      this.transport.start(event => {
        if (this.closed) return
        this.events = this.events.then(() => this.event(event)).catch(() => {
          // State/audit failure must not leave a controllable process alive.
          this.closed = true; this.onLeaderLost(); void this.transport.close(); void this.leader.close()
        })
      })
      this.timer = setInterval(() => { if (!this.sweeping && !this.closed) this.sweeping = this.sweep().catch(() => {
        this.closed = true; this.onLeaderLost(); void this.transport.close(); void this.leader.close()
      }).finally(() => { this.sweeping = undefined }) }, 1000)
      this.timer.unref()
    } catch (error) { await this.leader.close(); throw error }
  }
  settled(): Promise<void> { return this.events }
  private async available(): Promise<void> { await this.start(); if (this.closed) throw new DeviceError(503); await this.leader.check() }
  private transaction<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(104, hashtext(${userId}))`); return fn(tx) })
  }
  private async now(tx: Transaction): Promise<number> { const result = await tx.execute(sql`select floor(extract(epoch from clock_timestamp()) * 1000)::text as ms`); return Number(result.rows[0].ms) }
  private async record(tx: Transaction, row: Session, event: string, reason: string, commandId?: string): Promise<void> {
    await tx.insert(audit).values({ userId: row.userId, controlSessionId: row.id, commandId, event, reason, observedAt: await this.now(tx) })
  }
  private view(row: Session) { return robotControlSessionSchema.parse({ schemaVersion: 1, id: row.id, deviceSessionId: row.deviceSessionId, leaseId: row.leaseId, state: row.state, expiresAt: row.expiresAt, reason: row.reason }) }
  private commandView(row: Command) { return robotCommandViewSchema.parse({ schemaVersion: 1, id: row.id, controlSessionId: row.controlSessionId, sequence: row.sequence, behavior: row.behavior, state: row.state, issuedAt: row.issuedAt, expiresAt: row.expiresAt, reason: row.reason }) }
  private gateway(sessionId: string, device: string, connectionId?: string): RobotGatewayPresence {
    const observed = this.presence.get(sessionId)
    if (!this.transport.online || !observed || observed.value.state !== 'online' || performance.now() - observed.received >= 3000
      || observed.value.deviceId !== device || (connectionId && observed.value.connectionId !== connectionId)) throw new DeviceError(409, 'gateway unavailable')
    return observed.value
  }
  private async row(tx: Transaction, userId: string, id: string): Promise<Session> {
    const [row] = await tx.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, id))).for('update')
    if (!row) throw new DeviceError(404)
    return row
  }
  private current(row: Session, now: number): void {
    if (row.state !== 'active' || row.expiresAt <= now || !this.leader.active || this.closed
      || !this.embodiments.forUser(row.userId)?.permit('robot', row.leaseId)?.isCurrent()) throw new DeviceError(409, 'control lease unavailable')
    this.gateway(row.deviceSessionId, row.deviceId, row.connectionId)
  }
  async acquire(actor: DeviceActor, value: unknown) {
    const input = parseDevice(robotLeaseRequestSchema, value); await this.available()
    let acquired: { leaseId: string } | undefined
    try {
      return await this.devices.withUserSession(actor, input.deviceSessionId, ['behavior:stop'], async (tx, authority) => {
        const gateway = this.gateway(authority.sessionId, authority.deviceId)
        const [existing] = await tx.select().from(sessions).where(and(eq(sessions.userId, actor.userId), eq(sessions.state, 'active')))
        if (existing) throw new DeviceError(409, 'control lease already exists')
        const coordinator = this.embodiments.forUser(actor.userId), state = coordinator?.snapshot()
        if (!coordinator || !state?.lease || state.phase !== 'virtual') throw new DeviceError(409)
        const lease = coordinator.acquireRobot(state.lease.leaseId, authority.deviceId)
        if (!lease) throw new DeviceError(409)
        acquired = lease
        const [row] = await tx.insert(sessions).values({ id: randomUUID(), userId: actor.userId, deviceSessionId: authority.sessionId, deviceId: authority.deviceId,
          connectionId: gateway.connectionId, leaseId: lease.leaseId, state: 'active', reason: 'NONE', expiresAt: Math.floor(Math.min(lease.expiresAt, authority.expiresAt, authority.presenceExpiresAt, authority.now + 15000)) }).returning()
        await this.record(tx, row, 'acquired', 'NONE'); return this.view(row)
      })
    } catch (error) { if (acquired) this.embodiments.forUser(actor.userId)?.revoke(acquired.leaseId); throw error }
  }
  async heartbeat(actor: DeviceActor, id: string) {
    const hint = await this.sessionRow(actor.userId, id); await this.available()
    return this.devices.withUserSession(actor, hint.deviceSessionId, ['behavior:stop'], async (tx, authority) => {
      const row = await this.row(tx, actor.userId, hint.id); this.current(row, authority.now)
      const coordinator = this.embodiments.forUser(actor.userId)!
      if (!coordinator.heartbeat(row.leaseId, row.deviceId)) throw new DeviceError(409)
      const expiresAt = Math.floor(Math.min(coordinator.snapshot().lease!.expiresAt, authority.expiresAt, authority.presenceExpiresAt, authority.now + 15000))
      const [updated] = await tx.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.id)).returning()
      await this.record(tx, row, 'heartbeat', 'NONE'); return this.view(updated)
    })
  }
  private async sessionRow(userId: string, id: string): Promise<Session> {
    const key = parseDevice(deviceId, id), [row] = await this.database.db.select().from(sessions).where(and(eq(sessions.id, key), eq(sessions.userId, userId)))
    if (!row) throw new DeviceError(404)
    return row
  }
  async session(userId: string, id: string) { return this.view(await this.sessionRow(userId, id)) }
  async command(userId: string, id: string) {
    const key = parseDevice(deviceId, id), [row] = await this.database.db.select().from(commands).where(and(eq(commands.id, key), eq(commands.userId, userId), eq(commands.internal, 0)))
    if (!row) throw new DeviceError(404)
    return this.commandView(row)
  }
  private async prepare(tx: Transaction, row: Session, id: string, behavior: Command['behavior'], ttlMs: number, internal = false): Promise<Command> {
    const now = await this.now(tx), expiresAt = Math.min(now + ttlMs, internal ? now + ttlMs : row.expiresAt)
    const allocation = await tx.execute(sql`select nextval(pg_get_serial_sequence('robot_commands', 'sequence'))::text as sequence`)
    const sequence = Number(allocation.rows[0].sequence)
    const envelope = robotControlEnvelopeSchema.parse({ schemaVersion: 1, sessionId: row.deviceSessionId, connectionId: row.connectionId, sequence,
      leaseExpiresAt: internal ? expiresAt : row.expiresAt, intent: { schemaVersion: 1, intentId: id, conversationId: row.userId, deviceId: row.deviceId, leaseId: row.leaseId, behavior, issuedAt: now, expiresAt } })
    const [command] = await tx.insert(commands).values({ sequence, id, userId: row.userId, controlSessionId: row.id, behavior, ttlMs, envelope,
      internal: internal ? 1 : 0, state: 'prepared', reason: 'NONE', issuedAt: now, expiresAt }).returning()
    await this.record(tx, row, internal ? 'stop_prepared' : 'prepared', 'NONE', id); return command
  }
  async dispatch(actor: DeviceActor, value: unknown) {
    const input = parseDevice(robotControlRequestSchema, value); await this.available()
    const hint = await this.sessionRow(actor.userId, input.controlSessionId)
    // Persist before publish. A repeated request never re-emits an ambiguous command.
    const prepared = await this.devices.withUserSession(actor, hint.deviceSessionId, [`behavior:${input.behavior}`, 'behavior:stop'], async (tx, authority) => {
      const row = await this.row(tx, actor.userId, hint.id); this.current(row, authority.now)
      const [previous] = await tx.select().from(commands).where(and(eq(commands.userId, actor.userId), eq(commands.id, input.id)))
      if (previous) {
        if (previous.controlSessionId !== row.id || previous.behavior !== input.behavior || previous.ttlMs !== input.ttlMs || previous.internal) throw new DeviceError(409, 'intent id conflict')
        return { command: previous, created: false }
      }
      return { command: await this.prepare(tx, row, input.id, input.behavior, input.ttlMs), created: true }
    })
    if (!prepared.created) return this.commandView(prepared.command)
    try {
      await this.devices.withUserSession(actor, hint.deviceSessionId, [`behavior:${input.behavior}`, 'behavior:stop'], async (tx, authority) => {
        const row = await this.row(tx, actor.userId, hint.id); this.current(row, authority.now)
        const [command] = await tx.select().from(commands).where(eq(commands.sequence, prepared.command.sequence)).for('update')
        if (command.state !== 'prepared' || command.expiresAt <= authority.now) throw new DeviceError(409)
        await this.leader.check()
        // Recheck after asynchronous leader liveness check and immediately before the effect.
        this.current(row, await this.now(tx))
        if (command.expiresAt <= Date.now()) throw new DeviceError(409)
        await this.transport.publish(command.envelope)
        await tx.update(commands).set({ state: 'published' }).where(eq(commands.sequence, command.sequence))
        await this.record(tx, row, 'published', 'NONE', command.id)
      })
    } catch (error) {
      await this.closeControl(hint.userId, hint.id, this.transport.online ? 'DEVICE_ENDED' : 'BROKER_LOST')
      throw error instanceof DeviceError ? error : new DeviceError(503, 'robot delivery unknown')
    }
    return this.command(actor.userId, input.id)
  }
  private async closeRow(tx: Transaction, row: Session, reason: string): Promise<void> {
    if (row.state !== 'active') return
    await tx.update(sessions).set({ state: 'closed', reason }).where(eq(sessions.id, row.id))
    const uncertain = await tx.update(commands).set({ state: 'unknown', reason: ['BROKER_LOST', 'ACK_TIMEOUT', 'RESTART', 'RELEASED'].includes(reason) ? reason : 'AUTHORIZATION_LOST' })
      .where(and(eq(commands.controlSessionId, row.id), inArray(commands.state, pending))).returning()
    for (const command of uncertain) await this.record(tx, row, 'unknown', reason, command.id)
    await this.record(tx, row, 'closed', reason)
  }
  private async closeControl(userId: string, id: string, reason: string | ((tx: Transaction, row: Session) => Promise<string | undefined>)): Promise<void> {
    let stopped: Command | undefined, row: Session | undefined, closedLease: string | undefined
    await this.transaction(userId, async tx => {
      row = await this.row(tx, userId, id)
      if (row.state !== 'active') return
      const currentReason = typeof reason === 'string' ? reason : await reason(tx, row)
      if (!currentReason) return
      await this.closeRow(tx, row, currentReason)
      closedLease = row.leaseId
      // A safety stop uses only the previously authorized binding; revocation does not
      // grant any new action. It is persisted before the independent delivery attempt.
      if (this.transport.online && this.leader.active && !this.closed) stopped = await this.prepare(tx, row, randomUUID(), 'stop', 500, true)
    })
    if (closedLease) this.embodiments.forUser(userId)?.revoke(closedLease)
    if (stopped) {
      const command = stopped
      await this.transaction(userId, async tx => {
        let delivered = false
        try { if (this.leader.active && !this.closed) { await this.transport.publish(command.envelope); delivered = true } } catch { /* gateway watchdog remains authoritative */ }
        await tx.update(commands).set({ state: delivered ? 'published' : 'unknown', reason: delivered ? 'NONE' : 'BROKER_LOST' }).where(eq(commands.sequence, command.sequence))
        await this.record(tx, row!, delivered ? 'stop_published' : 'stop_unknown', delivered ? 'NONE' : 'BROKER_LOST', command.id)
      })
    }
  }
  async release(userId: string, id: string) { const row = await this.sessionRow(userId, id); await this.available(); await this.closeControl(userId, row.id, 'RELEASED'); return this.session(userId, row.id) }
  private async event(event: RobotTransportEvent): Promise<void> {
    if (this.closed) return
    if (event.kind === 'connection') {
      if (!event.online) { this.presence.clear(); await this.sweep('BROKER_LOST') }
      return
    }
    if (event.kind === 'presence') {
      const parsed = robotGatewayPresenceSchema.safeParse(event.value)
      if (!parsed.success) return
      const value = parsed.data, old = this.presence.get(value.sessionId)
      // LWT has an old timestamp/sequence; only the exact current nonce may take us offline.
      if (value.state === 'offline') {
        if (old?.value.connectionId === value.connectionId) { this.presence.delete(value.sessionId); await this.sweep() }
        return
      }
      if (Math.abs(Date.now() - value.issuedAt) > 3000 || (old && (value.connectionId === old.value.connectionId ? value.sequence <= old.value.sequence : value.issuedAt <= old.value.issuedAt))) return
      const [device] = await this.database.db.select().from(deviceSessions).where(eq(deviceSessions.id, value.sessionId))
      if (!device || device.status !== 'active' || device.deviceId !== value.deviceId || device.expiresAt <= Date.now()) return
      for (const [key, item] of this.presence) if (performance.now() - item.received >= 3000) this.presence.delete(key)
      if (!this.presence.has(value.sessionId) && this.presence.size >= 1000) return
      this.presence.set(value.sessionId, { value, received: performance.now() }); return
    }
    const parsed = robotControlAckSchema.safeParse(event.value)
    if (!parsed.success) return
    const value = parsed.data, [hint] = await this.database.db.select().from(commands).where(eq(commands.sequence, value.sequence))
    if (!hint) return
    await this.transaction(hint.userId, async tx => {
      const [command] = await tx.select().from(commands).where(eq(commands.sequence, value.sequence)).for('update'), envelope = command.envelope
      if (!pending.includes(command.state) || command.expiresAt <= await this.now(tx) || value.intentId !== command.id
        || value.sessionId !== envelope.sessionId || value.connectionId !== envelope.connectionId || value.leaseId !== envelope.intent.leaseId) return
      const row = await this.row(tx, hint.userId, command.controlSessionId)
      if (!command.internal && row.state !== 'active') return
      await tx.update(commands).set({ state: value.status === 'rejected' ? 'rejected' : 'accepted', reason: value.reason }).where(eq(commands.sequence, command.sequence))
      await this.record(tx, row, value.status === 'rejected' ? 'rejected' : 'accepted', value.reason, command.id)
    })
  }
  async sweep(force?: 'BROKER_LOST'): Promise<void> {
    if (!this.leader.active || this.closed) return
    // Active leases are bounded by the shared registry (1000); no historical-row starvation.
    const rows = await this.database.db.select().from(sessions).where(eq(sessions.state, 'active'))
    for (const candidate of rows) await this.closeControl(candidate.userId, candidate.id, async (tx, row) => {
      // Snapshot selection is only a hint: heartbeat, revocation and command state
      // are rechecked under the same owner lock immediately before closing.
      const now = await this.now(tx)
      let reason: string | undefined = force
      if (!reason) {
        try { this.current(row, now) } catch { reason = row.expiresAt <= now ? 'EXPIRED' : 'GATEWAY_LOST' }
        const [device] = await tx.select().from(deviceSessions).where(eq(deviceSessions.id, row.deviceSessionId))
        if (!device || device.status !== 'active' || Math.min(device.expiresAt, device.presenceExpiresAt) <= now) reason = 'DEVICE_ENDED'
        const [expired] = await tx.select().from(commands).where(and(eq(commands.controlSessionId, row.id), eq(commands.internal, 0), inArray(commands.state, pending), sql`${commands.expiresAt} <= ${now}`)).limit(1)
        if (expired) reason ??= 'ACK_TIMEOUT'
      }
      return reason
    })
    // Also terminate unacknowledged internal stops belonging to closed leases.
    const expired = await this.database.db.select().from(commands).where(and(eq(commands.internal, 1), inArray(commands.state, pending), sql`${commands.expiresAt} <= ${Date.now()}`))
    for (const command of expired) await this.transaction(command.userId, async tx => {
      const updated = await tx.update(commands).set({ state: 'unknown', reason: 'ACK_TIMEOUT' }).where(and(eq(commands.sequence, command.sequence), inArray(commands.state, pending))).returning()
      if (updated.length) await this.record(tx, await this.row(tx, command.userId, command.controlSessionId), 'unknown', 'ACK_TIMEOUT', command.id)
    })
  }
  async audit(userId: string, after = '0') {
    if (!/^\d{1,16}$/.test(after) || !Number.isSafeInteger(Number(after))) throw new DeviceError(400)
    const rows = await this.database.db.select({ id: audit.id, controlSessionId: audit.controlSessionId, commandId: audit.commandId, event: audit.event, reason: audit.reason, observedAt: audit.observedAt })
      .from(audit).where(and(eq(audit.userId, userId), gt(audit.id, Number(after)))).orderBy(asc(audit.id)).limit(51)
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? String(rows[49].id) : null }
  }
  async shutdown(): Promise<void> {
    clearInterval(this.timer)
    await this.ready?.catch(() => {}); await this.sweeping; await this.events
    if (this.leader.active && !this.closed) {
      const rows = await this.database.db.select().from(sessions).where(eq(sessions.state, 'active'))
      for (const row of rows) await this.closeControl(row.userId, row.id, 'RESTART')
    }
    this.closed = true; this.embodiments.close(); await this.transport.close(); await this.leader.close()
  }
}
