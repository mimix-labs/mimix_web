import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { fixture } from './support.js'
import { DeviceStore } from '../../dist/modules/devices/store.js'
import { DeviceTokens } from '../../dist/modules/devices/tokens.js'
import { EmbodimentSessions } from '../../dist/modules/embodiments/sessions.js'
import { RobotControlService } from '../../dist/modules/robot-control/service.js'
const denied = status => error => error.status === status
export async function controlFixture(t, transport) {
  let service
  t.after(() => service?.shutdown())
  const base = await fixture(t), identity = { provider: 'clerk', issuer: 'https://test.clerk.accounts.dev', subject: 'owner', sessionId: 'login-one' }
  const user = await base.identities.resolve(identity), actor = { userId: user.id, identity }
  const devices = new DeviceStore(base.database, async () => {}, new DeviceTokens(randomBytes(32).toString('base64url')))
  const verifier = randomBytes(32).toString('base64url'), pairing = await devices.createPairing(actor, { schemaVersion: 1, challenge: createHash('sha256').update(verifier).digest('hex'), capabilities: ['presence:heartbeat', 'behavior:greet', 'behavior:stop'] })
  const connected = await devices.exchange({ schemaVersion: 1, pairingId: pairing.id, code: pairing.code, verifier, capabilities: { schemaVersion: 1, deviceId: 'local', behaviors: ['greet', 'stop'], camera: [], handLandmarks: false, speech: false } })
  await devices.heartbeat(connected.token, { schemaVersion: 1, sequence: 1 })
  const published = [], embodiments = new EmbodimentSessions()
  let listener
  transport ??= { online: true, start(fn) { listener = fn }, async publish(value) { published.push(value) }, async close() { this.online = false } }
  service = new RobotControlService(base.database, devices, embodiments, transport)
  await service.start()
  const connectionId = randomUUID()
  const emit = async value => { listener(value); await service.settled() }
  if (listener) await emit({ kind: 'presence', value: { schemaVersion: 1, sessionId: connected.session.id, deviceId: connected.session.deviceId, connectionId, sequence: 1, state: 'online', issuedAt: Date.now() } })
  return { ...base, actor, devices, connected, published, service, emit, connectionId, embodiments, transport }
}
const acquire = f => f.service.acquire(f.actor, { schemaVersion: 1, deviceSessionId: f.connected.session.id })
const request = lease => ({ schemaVersion: 1, id: randomUUID(), controlSessionId: lease.id, behavior: 'greet', ttlMs: 1500 })
test('control authorizes exact owner/login/capability and uses the shared voice lease', async t => {
  const f = await controlFixture(t), stranger = await f.identities.resolve({ ...f.actor.identity, subject: 'stranger' })
  await assert.rejects(f.service.acquire({ ...f.actor, userId: stranger.id }, { schemaVersion: 1, deviceSessionId: f.connected.session.id }), denied(404))
  await assert.rejects(f.service.acquire({ ...f.actor, identity: { ...f.actor.identity, sessionId: 'other' } }, { schemaVersion: 1, deviceSessionId: f.connected.session.id }), denied(403))
  const lease = await acquire(f)
  assert.equal(f.embodiments.forUser(f.actor.userId).snapshot().phase, 'robot')
  await assert.rejects(f.service.dispatch(f.actor, { ...request(lease), behavior: 'celebrate' }), denied(403))
  await f.service.release(f.actor.userId, lease.id)
  assert.equal(f.embodiments.forUser(f.actor.userId).snapshot().phase, 'virtual')
  await assert.rejects(f.service.dispatch(f.actor, request(lease)), denied(409))
})
test('durable idempotency, correlated ACK and immutable owner audit', async t => {
  const f = await controlFixture(t), lease = await acquire(f), input = request(lease)
  const command = await f.service.dispatch(f.actor, input)
  assert.equal(command.state, 'published'); assert.equal(f.published.length, 1)
  const envelope = f.published[0]
  assert.equal(envelope.intent.intentId, input.id)
  assert.ok(envelope.intent.expiresAt <= lease.expiresAt)
  assert.equal((await f.service.dispatch(f.actor, input)).id, input.id)
  assert.equal(f.published.length, 1)
  await assert.rejects(f.service.dispatch(f.actor, { ...input, ttlMs: 500 }), denied(409))
  const ack = { schemaVersion: 1, sessionId: envelope.sessionId, connectionId: envelope.connectionId, intentId: input.id, leaseId: envelope.intent.leaseId, sequence: envelope.sequence, status: 'accepted', reason: 'ACCEPTED' }
  await f.emit({ kind: 'ack', value: { ...ack, connectionId: randomUUID() } })
  assert.equal((await f.service.command(f.actor.userId, input.id)).state, 'published')
  await f.emit({ kind: 'ack', value: ack }); await f.emit({ kind: 'ack', value: ack })
  assert.equal((await f.service.command(f.actor.userId, input.id)).state, 'accepted')
  const audit = await f.service.audit(f.actor.userId)
  assert.equal(audit.items.filter(item => item.event === 'accepted').length, 1)
  await assert.rejects(f.database.pool.query("update robot_control_audit set reason = 'rewritten'"), /append-only/)
})
test('revocation prevents dispatch; broker loss cancels leases and never queues', async t => {
  const f = await controlFixture(t), lease = await acquire(f)
  await f.devices.revoke(f.actor.userId, f.connected.session.id)
  await assert.rejects(f.service.dispatch(f.actor, request(lease)), denied(401))
  assert.equal(f.published.filter(item => item.intent.behavior !== 'stop').length, 0)
  f.transport.online = false
  await f.emit({ kind: 'connection', online: false })
  assert.equal((await f.service.session(f.actor.userId, lease.id)).state, 'closed')
})
test('one database leader; restart never replays uncertain commands', async t => {
  const f = await controlFixture(t), lease = await acquire(f), input = request(lease)
  await f.service.dispatch(f.actor, input)
  const another = new RobotControlService(f.database, f.devices, new EmbodimentSessions(), { online: true, start() {}, async publish() { throw new Error('must not replay') }, async close() {} })
  await assert.rejects(another.start(), denied(503)); await another.shutdown()
  await f.service.shutdown()
  const next = new RobotControlService(f.database, f.devices, new EmbodimentSessions(), { online: true, start() {}, async publish() { throw new Error('must not replay') }, async close() {} })
  t.after(() => next.shutdown()); await next.start()
  assert.equal((await next.command(f.actor.userId, input.id)).state, 'unknown')
  assert.equal((await next.session(f.actor.userId, lease.id)).state, 'closed')
  await next.shutdown()
})

test('ACK timeout becomes unknown, closes lease and a late ACK cannot revive it', async t => {
  const f = await controlFixture(t), lease = await acquire(f), input = request(lease)
  await f.service.dispatch(f.actor, input)
  const envelope = f.published[0]
  await f.database.pool.query('update robot_commands set issued_at = $1, expires_at = $2 where id = $3', [Date.now() - 1000, Date.now() - 1, input.id])
  await f.service.sweep()
  assert.equal((await f.service.command(f.actor.userId, input.id)).state, 'unknown')
  assert.equal((await f.service.session(f.actor.userId, lease.id)).reason, 'ACK_TIMEOUT')
  assert.ok(f.published.some(value => value.intent.behavior === 'stop'))
  await f.emit({ kind: 'ack', value: { schemaVersion: 1, sessionId: envelope.sessionId, connectionId: envelope.connectionId, intentId: input.id, leaseId: envelope.intent.leaseId, sequence: envelope.sequence, status: 'accepted', reason: 'ACCEPTED' } })
  assert.equal((await f.service.command(f.actor.userId, input.id)).state, 'unknown')
})
test('revocation serializes with an in-flight publish and blocks subsequent effects', async t => {
  const f = await controlFixture(t), lease = await acquire(f)
  let entered, finish
  const barrier = new Promise(resolve => { entered = resolve }), release = new Promise(resolve => { finish = resolve })
  f.transport.publish = async value => { f.published.push(value); if (value.intent.behavior !== 'stop') { entered(); await release } }
  const delivery = f.service.dispatch(f.actor, request(lease)); await barrier
  let revoked = false
  const revocation = f.devices.revoke(f.actor.userId, f.connected.session.id).then(() => { revoked = true })
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(revoked, false)
  finish(); await delivery; await revocation
  await assert.rejects(f.service.dispatch(f.actor, request(lease)), denied(401))
  await f.service.sweep()
  assert.equal((await f.service.session(f.actor.userId, lease.id)).reason, 'DEVICE_ENDED')
  assert.equal(f.published.filter(value => value.intent.behavior !== 'stop').length, 1)
})
test('loss of database leader connection closes shared embodiment and transport', async t => {
  const f = await controlFixture(t), lease = await acquire(f)
  const leader = await f.database.pool.query("select pid from pg_locks where locktype='advisory' and classid=105 and objid=1 and database=(select oid from pg_database where datname=current_database())")
  await f.database.pool.query('select pg_terminate_backend($1)', [leader.rows[0].pid])
  for (let i = 0; i < 50 && f.transport.online; i++) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(f.transport.online, false)
  assert.equal(f.embodiments.forUser(f.actor.userId), undefined)
  await assert.rejects(f.service.dispatch(f.actor, request(lease)), denied(503))
})

test('expiry between sweep passes still closes the parent lease on the next pass', async t => {
  const f = await controlFixture(t)
  clearInterval(f.service.timer)
  const lease = await acquire(f), input = request(lease)
  await f.service.dispatch(f.actor, input)
  const close = f.service.closeControl.bind(f.service)
  let triggered = false
  f.service.closeControl = async (...args) => {
    const result = await close(...args)
    if (!triggered) {
      triggered = true
      await f.database.pool.query('update robot_commands set issued_at=$1, expires_at=$2 where id=$3', [Date.now() - 1500, Date.now() - 1, input.id])
    }
    return result
  }
  try { await f.service.sweep() } finally { f.service.closeControl = close }
  await f.service.sweep()
  assert.equal(triggered, true)
  assert.equal((await f.service.command(f.actor.userId, input.id)).state, 'unknown')
  assert.equal((await f.service.session(f.actor.userId, lease.id)).state, 'closed')
})

test('sweep rechecks a concurrently renewed lease under the owner lock', async t => {
  const f = await controlFixture(t)
  clearInterval(f.service.timer)
  const lease = await acquire(f)
  await f.database.pool.query('update robot_control_sessions set expires_at=$1 where id=$2', [Date.now() + 400, lease.id])
  const query = f.database.pool.query.bind(f.database.pool)
  let triggered = false, renewed
  f.database.pool.query = async (...args) => {
    const result = await query(...args), text = typeof args[0] === 'string' ? args[0] : args[0].text
    if (!triggered && text.startsWith('select') && text.includes('robot_control_sessions') && text.includes('"state" =')) {
      triggered = true; renewed = await f.service.heartbeat(f.actor, lease.id)
      await new Promise(resolve => setTimeout(resolve, 450))
    }
    return result
  }
  try { await f.service.sweep() } finally { f.database.pool.query = query }
  assert.equal(triggered, true); assert.ok(renewed.expiresAt > Date.now())
  assert.equal((await f.service.session(f.actor.userId, lease.id)).state, 'active')
})

for (const reconnect of [false, true]) test(`reacquisition waits for the previous stop delivery (gateway reconnect=${reconnect})`, async t => {
  const { GatewayGuard } = await import('@mimix/robot-protocol')
  const f = await controlFixture(t)
  clearInterval(f.service.timer)
  const signals = [], stops = []
  const output = { perform(intent, signal) { signals.push({ intent, signal }) }, stop(reason) { stops.push(reason) } }
  let gateway = new GatewayGuard({ sessionId: f.connected.session.id, deviceId: f.connected.session.deviceId, connectionId: f.connectionId, behaviors: ['greet', 'stop'], output })
  t.after(() => gateway.disconnect())
  f.transport.publish = async envelope => { f.published.push(envelope); gateway.receive(envelope) }
  const oldLease = await acquire(f)
  await f.service.dispatch(f.actor, request(oldLease))
  const transaction = f.service.transaction.bind(f.service)
  let calls = 0, entered, finish
  const beforeStop = new Promise(resolve => { entered = resolve }), resumeStop = new Promise(resolve => { finish = resolve })
  // Pause the second close transaction after its durable intent, before publication.
  f.service.transaction = async (...args) => {
    if (++calls === 2) { entered(); await resumeStop }
    return transaction(...args)
  }
  const closing = f.service.release(f.actor.userId, oldLease.id)
  await beforeStop
  if (reconnect) {
    gateway.disconnect()
    const connectionId = randomUUID()
    gateway = new GatewayGuard({ sessionId: f.connected.session.id, deviceId: f.connected.session.deviceId, connectionId, behaviors: ['greet', 'stop'], output })
    await f.emit({ kind: 'presence', value: { schemaVersion: 1, sessionId: f.connected.session.id, deviceId: f.connected.session.deviceId, connectionId, sequence: 1, state: 'online', issuedAt: Date.now() } })
  }
  let acquired = false
  const next = acquire(f).then(async lease => { acquired = true; await f.service.dispatch(f.actor, request(lease)); return lease })
  try {
    await new Promise(resolve => setTimeout(resolve, 50))
    const overtookStop = acquired
    finish(); await closing
    const nextLease = await next
    const current = signals.find(value => value.intent.leaseId === nextLease.leaseId)
    assert.ok(current, 'new intention reached the semantic driver')
    assert.equal(current.signal.aborted, false, 'old stop must not abort the new lease')
    assert.equal(overtookStop, false, 'a new lease must not overtake the pending old stop')
    assert.equal((await f.service.session(f.actor.userId, nextLease.id)).state, 'active')
  } finally { finish(); await closing; await next; f.service.transaction = transaction }
})

test('leader close releases the server lock before a delayed TCP close', async t => {
  const { ControlLeader } = await import('../../dist/modules/robot-control/leader.js')
  let first, second
  t.after(async () => { await first?.close(); await second?.close() })
  const f = await fixture(t)
  first = new ControlLeader(f.database, () => {}); second = new ControlLeader(f.database, () => {})
  await first.start()
  const client = first.client, release = client.release.bind(client)
  let finished
  const networkClosed = new Promise(resolve => { finished = resolve })
  // TCP FIN processing can lag behind PoolClient.release(true), as on the CI runner.
  client.release = (...args) => { setTimeout(() => { release(...args); finished() }, 200) }
  try {
    await first.close()
    await assert.doesNotReject(second.start(), 'orderly close must release PostgreSQL authority before returning')
  } finally { await networkClosed; await second.close() }
})

test('concurrent leader closes share the pending PostgreSQL unlock acknowledgement', async t => {
  const { ControlLeader } = await import('../../dist/modules/robot-control/leader.js')
  let leader
  t.after(() => leader?.close())
  const f = await fixture(t)
  leader = new ControlLeader(f.database, () => {})
  await leader.start()
  const client = leader.client, query = client.query.bind(client)
  let entered, finish
  const unlocking = new Promise(resolve => { entered = resolve }), resume = new Promise(resolve => { finish = resolve })
  client.query = async (...args) => {
    if (String(args[0]).includes('pg_advisory_unlock')) { entered(); await resume }
    return query(...args)
  }
  const first = leader.close()
  await unlocking
  let secondCompleted = false
  const second = leader.close().then(() => { secondCompleted = true })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(secondCompleted, false, 'a concurrent shutdown must also await server unlock')
  } finally { finish(); await Promise.all([first, second]) }
})
