import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import { fixture } from './support.js'
import * as devices from '../../dist/modules/devices/store.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const offered = { schemaVersion: 1, deviceId: 'untrusted-local-label', behaviors: ['stop', 'celebrate'], camera: ['mjpeg'], handLandmarks: true, speech: false }
async function setup(t) {
  const base = await fixture(t)
  const identity = { provider: 'clerk', issuer: 'https://test.clerk.accounts.dev', subject: 'owner', sessionId: 'login-one' }
  const owner = await base.identities.resolve(identity)
  const stranger = await base.identities.resolve({ ...identity, subject: 'stranger' })
  const verification = { state: 'active', identities: [] }
  const store = new devices.DeviceStore(base.database, async value => {
    verification.identities.push(value)
    if (verification.state !== 'active') throw new IdentityError(verification.state === 'revoked' ? 401 : 503)
  })
  const actor = { userId: owner.id, identity }
  const request = { schemaVersion: 1, capabilities: ['presence:heartbeat', 'behavior:stop'] }
  async function pairing(capabilities = request.capabilities) {
    const verifier = randomBytes(32).toString('base64url')
    const invitation = await store.createPairing(actor, { ...request, capabilities, challenge: hash(verifier) })
    const exchange = { schemaVersion: 1, pairingId: invitation.id, code: invitation.code, verifier, capabilities: offered }
    return { invitation, verifier, exchange }
  }
  const connect = async () => { const p = await pairing(); return { ...p, ...await store.exchange(p.exchange) } }
  return { ...base, store, actor, stranger, verification, pairing, connect }
}
const status = expected => error => { assert.equal(error.status, expected, error.message); return true }

test('pairing exchanges proof for a scoped device credential with fixed TTL and no user identity leakage', async t => {
  const { store, database, connect, actor } = await setup(t)
  const p = await connect()
  assert.equal(p.invitation.expiresAt - p.invitation.createdAt, 300000)
  assert.equal(p.session.expiresAt - p.session.createdAt, 900000)
  assert.equal(p.session.presence, null)
  assert.notEqual(p.session.deviceId, offered.deviceId)
  assert.equal(p.token.length, 43)
  const wire = JSON.stringify({ invitation: p.invitation, session: p.session })
  assert.equal(wire.includes(actor.userId), false)
  assert.equal(wire.includes('login-one'), false)
  const rows = await database.pool.query('select row_to_json(p) value from device_pairings p union all select row_to_json(s) from device_sessions s')
  const stored = JSON.stringify(rows.rows)
  for (const secret of [p.token, p.invitation.code, p.verifier]) assert.equal(stored.includes(secret), false)
  assert.equal((await store.self(p.token)).id, p.session.id)
})

test('stolen code without verifier cannot exchange; original robot still can; replay cannot mint twice', async t => {
  const { store, pairing, actor } = await setup(t)
  const p = await pairing()
  await assert.rejects(store.exchange({ ...p.exchange, verifier: randomBytes(32).toString('base64url') }), status(401))
  const connected = await store.exchange(p.exchange)
  assert.equal(connected.session.status, 'active')
  await assert.rejects(store.exchange(p.exchange), status(401))
  assert.equal((await store.audit(actor.userId)).items.some(row => row.reason === 'pairing_replay'), true)
})

test('five failed proof attempts lock pairing, while a fresh invitation recovers', async t => {
  const { store, pairing } = await setup(t)
  const p = await pairing()
  for (let n = 0; n < 5; n++) await assert.rejects(store.exchange({ ...p.exchange, verifier: 'x'.repeat(43) }), status(401))
  await assert.rejects(store.exchange(p.exchange), status(401))
  const fresh = await pairing()
  assert.equal((await store.exchange(fresh.exchange)).session.status, 'active')
})

test('parallel exchanges across store instances consume the pairing atomically', async t => {
  const { store, database, pairing } = await setup(t)
  const p = await pairing()
  const other = new devices.DeviceStore(database, async () => {})
  const outcomes = await Promise.allSettled([store.exchange(p.exchange), other.exchange(p.exchange)])
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1)
  const counts = await database.pool.query("select count(*)::int n from device_audit where event = 'paired'")
  assert.equal(counts.rows[0].n, 1)
})

test('grant requires advertised capability and authorization requires owner, login, session and approved capability', async t => {
  const { store, actor, stranger, pairing, connect } = await setup(t)
  const unsupported = await pairing(['presence:heartbeat', 'speech:play'])
  await assert.rejects(store.exchange(unsupported.exchange), status(403))
  const p = await connect()
  await assert.rejects(store.authorize(actor, p.session.id, { schemaVersion: 1, capability: 'behavior:stop' }), status(403))
  await store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 })
  assert.equal((await store.authorize(actor, p.session.id, { schemaVersion: 1, capability: 'behavior:stop' })).authorized, true)
  await assert.rejects(store.authorize(actor, p.session.id, { schemaVersion: 1, capability: 'behavior:celebrate' }), status(403))
  await assert.rejects(store.authorize({ ...actor, userId: stranger.id }, p.session.id, { schemaVersion: 1, capability: 'behavior:stop' }), status(404))
  await assert.rejects(store.authorize({ ...actor, identity: { ...actor.identity, sessionId: 'other-login' } }, p.session.id, { schemaVersion: 1, capability: 'behavior:stop' }), status(403))
  await assert.rejects(store.authorize(actor, randomUUID(), { schemaVersion: 1, capability: 'behavior:stop' }), status(404))
})

test('heartbeat replay never advances presence, and reconnect cannot reset sequence', async t => {
  const { store, connect } = await setup(t)
  const p = await connect()
  const first = await store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 })
  assert.equal(first.presence.expiresAt - first.presence.observedAt, 30000)
  await assert.rejects(store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 }), status(409))
  assert.deepEqual((await store.self(p.token)).presence, first.presence)
  const next = await store.heartbeat(p.token, { schemaVersion: 1, sequence: 2 })
  assert.equal(next.expiresAt, p.session.expiresAt)
  assert.equal(next.nextSequence, 3)
})

test('owner may recover from a new login by revoking; other users cannot inspect or revoke', async t => {
  const { store, actor, stranger, connect, database } = await setup(t)
  const p = await connect()
  await assert.rejects(store.get(stranger.id, p.session.id), status(404))
  await assert.rejects(store.revoke(stranger.id, p.session.id), status(404))
  assert.equal((await store.revoke(actor.userId, p.session.id)).status, 'revoked')
  await assert.rejects(store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 }), status(401))
  const restarted = new devices.DeviceStore(database, async () => {})
  await assert.rejects(restarted.self(p.token), status(401))
})

test('explicit disconnect is terminal and queued heartbeats cannot resurrect the session', async t => {
  const { store, connect } = await setup(t)
  const p = await connect()
  await store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 })
  assert.equal((await store.disconnect(p.token, { schemaVersion: 1, sequence: 2 })).status, 'disconnected')
  await assert.rejects(store.heartbeat(p.token, { schemaVersion: 1, sequence: 3 }), status(401))
})

for (const field of ['expires_at', 'presence_expires_at']) {
  test(`${field} expires on access and records exactly one transition`, async t => {
    const { store, database, actor, connect } = await setup(t)
    const p = await connect()
    await database.pool.query(`update device_sessions set ${field} = 1 where id = $1`, [p.session.id])
    await assert.rejects(store.self(p.token), status(401))
    await store.sweep(); await store.sweep()
    assert.equal((await store.get(actor.userId, p.session.id)).status, 'expired')
    const rows = await database.pool.query("select count(*)::int n from device_audit where session_id = $1 and event = 'expired'", [p.session.id])
    assert.equal(rows.rows[0].n, 1)
  })
}

test('expired and owner-cancelled invitations cannot be exchanged', async t => {
  const { store, database, actor, stranger, pairing } = await setup(t)
  const expired = await pairing()
  await database.pool.query('update device_pairings set expires_at = 1 where id = $1', [expired.invitation.id])
  await assert.rejects(store.exchange(expired.exchange), status(401))
  const cancelled = await pairing()
  await assert.rejects(store.cancelPairing(stranger.id, cancelled.invitation.id), status(404))
  await store.cancelPairing(actor.userId, cancelled.invitation.id)
  await assert.rejects(store.exchange(cancelled.exchange), status(401))
})

test('originating login revocation denies exchange and revokes device authority; identity outages fail closed', async t => {
  const { store, actor, verification, pairing, connect } = await setup(t)
  const p = await connect()
  const pending = await pairing()
  verification.state = 'unavailable'
  await assert.rejects(store.self(p.token), status(503))
  verification.state = 'revoked'
  await assert.rejects(store.exchange(pending.exchange), status(401))
  await assert.rejects(store.heartbeat(p.token, { schemaVersion: 1, sequence: 1 }), status(401))
  verification.state = 'active'
  await assert.rejects(store.self(p.token), status(401))
  assert.equal((await store.get(actor.userId, p.session.id)).status, 'revoked')
  assert.equal(verification.identities.some(i => i.sessionId === 'login-one'), true)
})

test('audit is owner-filtered, append-only, redacted and paginated', async t => {
  const { store, actor, stranger, database, connect } = await setup(t)
  const p = await connect()
  for (let sequence = 1; sequence <= 52; sequence++) await store.heartbeat(p.token, { schemaVersion: 1, sequence })
  const first = await store.audit(actor.userId)
  assert.equal(first.items.length, 50)
  assert.ok(first.nextCursor)
  const second = await store.audit(actor.userId, first.nextCursor)
  assert.ok(second.items.length > 0)
  assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, first.items.length + second.items.length)
  assert.deepEqual((await store.audit(stranger.id)).items, [])
  const log = JSON.stringify(first)
  for (const secret of [p.token, p.invitation.code, p.verifier, 'login-one']) assert.equal(log.includes(secret), false)
  await assert.rejects(database.pool.query("update device_audit set event = 'revoked'"), /append-only/)
})

test('database limits pending invitations and active sessions across callers, freeing slots on revocation', async t => {
  const { store, actor, pairing, connect } = await setup(t)
  const sessions = []
  for (let n = 0; n < 5; n++) sessions.push(await connect())
  const overflow = await pairing()
  await assert.rejects(store.exchange(overflow.exchange), status(429))
  await store.revoke(actor.userId, sessions[0].session.id)
  assert.equal((await store.exchange(overflow.exchange)).session.status, 'active')
  for (let n = 0; n < 10; n++) await pairing()
  await assert.rejects(pairing(), status(429))
})

test('sweep expires silent devices and pending invitations without incoming traffic, once across replicas', async t => {
  const { store, database, connect, pairing } = await setup(t)
  const p = await connect(), pending = await pairing()
  await database.pool.query('update device_sessions set presence_expires_at = 1 where id = $1', [p.session.id])
  await database.pool.query('update device_pairings set expires_at = 1 where id = $1', [pending.invitation.id])
  const replica = new devices.DeviceStore(database, async () => {})
  await Promise.all([store.sweep(), replica.sweep()])
  const log = await database.pool.query("select event, count(*)::int n from device_audit where event in ('expired', 'pairing_expired') group by event order by event")
  assert.deepEqual(log.rows, [{ event: 'expired', n: 1 }, { event: 'pairing_expired', n: 1 }])
})

test('revocation racing with a heartbeat cannot leave the device active', async t => {
  const { store, actor, database, connect } = await setup(t)
  const p = await connect(), replica = new devices.DeviceStore(database, async () => {})
  const outcomes = await Promise.allSettled([replica.heartbeat(p.token, { schemaVersion: 1, sequence: 1 }), store.revoke(actor.userId, p.session.id)])
  assert.equal(outcomes[1].status, 'fulfilled')
  await assert.rejects(replica.heartbeat(p.token, { schemaVersion: 1, sequence: 2 }), status(401))
  assert.equal((await store.get(actor.userId, p.session.id)).status, 'revoked')
})

test('deadline is sampled after remote identity verification and a late response cannot refresh expired presence', async t => {
  const { database, store, actor, connect } = await setup(t)
  const p = await connect()
  await database.pool.query('update device_sessions set presence_expires_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 50 where id = $1', [p.session.id])
  const slow = new devices.DeviceStore(database, () => new Promise(resolve => setTimeout(resolve, 100)))
  await assert.rejects(slow.heartbeat(p.token, { schemaVersion: 1, sequence: 1 }), status(401))
  assert.equal((await store.get(actor.userId, p.session.id)).presence, null)
})

test('audit cursor never skips an event whose transaction commits after a later request', async t => {
  const { store, database, actor, connect } = await setup(t)
  const first = await connect(), second = await connect()
  for (let sequence = 1; sequence <= 45; sequence++) await store.heartbeat(first.token, { schemaVersion: 1, sequence })
  // Pause at the real transaction commit boundary, after its audit sequence was allocated.
  let release, entered
  const gate = new Promise(resolve => { release = resolve }), waiting = new Promise(resolve => { entered = resolve })
  t.after(() => release())
  const original = database.db.transaction.bind(database.db)
  let pauseNext = true
  database.db.transaction = (work, ...args) => original(async tx => {
    const pause = pauseNext; pauseNext = false
    const result = await work(tx)
    if (pause) { entered(); await gate }
    return result
  }, ...args)
  const slow = store.heartbeat(first.token, { schemaVersion: 1, sequence: 46 })
  await waiting
  const fast = store.heartbeat(second.token, { schemaVersion: 1, sequence: 1 })
  await new Promise(resolve => setTimeout(resolve, 100))
  const before = await store.audit(actor.userId)
  release(); await Promise.all([slow, fast])
  const after = await store.audit(actor.userId, String(before.items.at(-1).id))
  const committed = await database.pool.query('select id::int from device_audit where user_id = $1 order by id', [actor.userId])
  assert.deepEqual([...before.items, ...after.items].map(row => row.id), committed.rows.map(row => row.id))
})
