import assert from 'node:assert/strict'
import test from 'node:test'
import * as core from '../dist/modules/embodiments/coordinator.js'
import * as adapters from '../dist/modules/embodiments/adapters.js'
import * as sessions from '../dist/modules/embodiments/sessions.js'
const user = '11111111-1111-4111-8111-111111111111', robot = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333'
const utterance = '44444444-4444-4444-8444-444444444444'
function fixture(options = {}) {
  assert.equal(typeof core.EmbodimentCoordinator, 'function')
  let now = 0
  const scheduled = new Set()
  const clock = { now: () => now, schedule: (callback, delay) => { const task = { callback, at: now + delay }; scheduled.add(task); return () => scheduled.delete(task) } }
  const coordinator = new core.EmbodimentCoordinator(user, user, { ttlMs: 100, clock, ...options })
  return { coordinator, clock, advance: (value, run = true) => { now = value; if (run) for (const task of [...scheduled]) if (task.at <= now) { scheduled.delete(task); task.callback() } }, scheduled }
}

test('CAS acquisition has one winner and silences web before granting robot', async () => {
  const { coordinator: c } = fixture()
  const start = c.snapshot(), web = c.permit('web', start.lease.leaseId)
  assert.equal(start.phase, 'virtual'); assert.equal(web.signal.aborted, false)
  const results = await Promise.all([robot, other].map(holder => Promise.resolve().then(() => c.acquireRobot(start.lease.leaseId, holder))))
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal(c.snapshot().webMuted, true); assert.equal(web.signal.aborted, true)
  assert.equal(c.permit('web', start.lease.leaseId), undefined)
  assert.equal(c.snapshot().lease.holderId, robot)
  c.close()
})

test('heartbeat preserves lease but stale/foreign heartbeats cannot renew or resurrect', () => {
  const { coordinator: c, advance } = fixture()
  const lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  advance(90)
  assert.equal(c.heartbeat(lease.leaseId, other), false)
  assert.equal(c.heartbeat(lease.leaseId, robot), true)
  assert.equal(c.snapshot().lease.expiresAt, 190)
  advance(100); assert.equal(c.snapshot().phase, 'robot')
  advance(190, false)
  assert.equal(c.heartbeat(lease.leaseId, robot), false)
  assert.equal(c.snapshot().phase, 'virtual')
  assert.notEqual(c.snapshot().lease.leaseId, lease.leaseId)
  c.close()
})

test('expiration timer aborts physical permission and revocation creates fresh virtual lease', () => {
  const { coordinator: c, advance } = fixture()
  const lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  const permission = c.permit('robot', lease.leaseId)
  advance(100)
  assert.equal(permission.signal.aborted, true)
  const fallback = c.snapshot().lease
  assert.equal(fallback.kind, 'web'); assert.equal(fallback.revision, 3)
  assert.equal(c.revoke(lease.leaseId), false)
  const current = c.acquireRobot(fallback.leaseId, other)
  assert.equal(c.revoke(current.leaseId), true)
  assert.equal(c.snapshot().phase, 'virtual')
  c.close()
})

test('reconnection fences old holders, copied snapshots cannot mutate authority and closed is terminal', () => {
  const { coordinator: c, scheduled } = fixture()
  const old = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  const copy = c.snapshot(); copy.lease.kind = 'web'; copy.lease.expiresAt = 999999
  assert.equal(c.snapshot().phase, 'robot')
  const fresh = c.acquireRobot(old.leaseId, other)
  assert.equal(c.permit('robot', old.leaseId), undefined)
  assert.equal(c.heartbeat(old.leaseId, robot), false)
  assert.equal(c.snapshot().lease.holderId, other)
  const permit = c.permit('robot', fresh.leaseId)
  c.close(); c.close()
  assert.equal(permit.signal.aborted, true); assert.equal(scheduled.size, 0)
  assert.deepEqual(c.snapshot(), { schemaVersion: 1, phase: 'closed', lease: null, webMuted: true })
  assert.equal(c.acquireRobot(fresh.leaseId, robot), undefined)
  assert.equal(c.heartbeat(fresh.leaseId, other), false)
})

test('web output stops on transfer and neither holder replays an already delivered utterance', () => {
  const { coordinator: c } = fixture()
  assert.equal(typeof adapters.WebEmbodiment, 'function')
  let plays = 0, stops = 0
  const web = new adapters.WebEmbodiment(c, { stop: () => { stops++ } })
  const permit = web.permit()
  assert.equal(web.present(permit, utterance, () => { plays++ }), true)
  assert.equal(web.present(permit, utterance, () => { plays++ }), false)
  const lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  assert.equal(stops, 1); assert.equal(web.permit(), undefined)
  assert.equal(web.present(permit, other, () => { plays++ }), false)
  const stub = new adapters.RobotEmbodiment(c)
  assert.equal(stub.perform(lease.leaseId, utterance).status, 'suppressed')
  assert.equal(stub.perform(lease.leaseId, other).status, 'stub')
  c.revoke(lease.leaseId)
  assert.equal(stub.perform(lease.leaseId, robot).status, 'suppressed')
  assert.equal(web.present(web.permit(), other, () => { plays++ }), false)
  assert.equal(plays, 1)
  web.close(); c.close()
})

test('failed output remains consumed, delivery capacity is bounded, invalid IDs do not mutate state', () => {
  const { coordinator: c } = fixture({ maxUtterances: 1 })
  const web = new adapters.WebEmbodiment(c, { stop: () => {} })
  assert.throws(() => web.present(web.permit(), utterance, () => { throw new Error('output failed') }), /output failed/)
  assert.equal(web.present(web.permit(), utterance, () => {}), false)
  assert.equal(web.present(web.permit(), other, () => {}), false)
  const before = c.snapshot()
  assert.throws(() => c.acquireRobot(before.lease.leaseId, 'bad'))
  assert.deepEqual(c.snapshot(), before)
  c.close(); web.close()
  assert.throws(() => fixture({ ttlMs: 0 }))
  assert.throws(() => fixture({ maxUtterances: 0 }))
})

test('registry bounds conversations, expires idle virtual sessions and never evicts active robot', () => {
  assert.equal(typeof sessions.EmbodimentSessions, 'function')
  const { clock, advance } = fixture()
  const registry = new sessions.EmbodimentSessions({ maxSessions: 1, idleMs: 200, ttlMs: 100, clock })
  const a = registry.forUser(user)
  const lease = a.acquireRobot(a.snapshot().lease.leaseId, robot)
  advance(190); // robot has expired, so it can be cleaned after idle deadline
  assert.equal(registry.forUser(other), undefined)
  advance(201)
  const b = registry.forUser(other)
  assert.ok(b); assert.equal(a.snapshot().phase, 'closed')
  assert.notEqual(b.snapshot().lease.leaseId, lease.leaseId)
  registry.close()
  assert.equal(registry.forUser(user), undefined)
  assert.equal(b.snapshot().phase, 'closed')
})

test('playback cannot start without a stop-capable output adapter', () => {
  const { coordinator: c } = fixture()
  const web = new adapters.WebEmbodiment(c)
  let played = false
  assert.equal(web.present(web.permit(), utterance, () => { played = true }), false)
  assert.equal(played, false)
  c.close()
})

test('active web playback survives virtual lease expiry and natural completion releases retention', () => {
  const { coordinator: c, advance } = fixture()
  let stops = 0
  const web = new adapters.WebEmbodiment(c, { stop: () => { stops++ } })
  const permit = web.permit()
  assert.equal(web.present(permit, utterance, () => {}), true)
  advance(100)
  assert.equal(permit.isCurrent(), true)
  assert.equal(stops, 0)
  assert.equal(web.complete(other), false)
  assert.equal(web.complete(utterance), true)
  assert.equal(web.complete(utterance), false)
  assert.equal(stops, 0)
  advance(200)
  assert.equal(permit.signal.aborted, true)
  web.close()
  assert.equal(stops, 0)
  c.close()
})

test('late completion from a replaced clip cannot release current playback', () => {
  const { coordinator: c, advance } = fixture()
  let stops = 0
  const web = new adapters.WebEmbodiment(c, { stop: () => { stops++ } })
  const permit = web.permit()
  assert.equal(web.present(permit, utterance, () => {}), true)
  assert.equal(web.present(permit, other, () => {}), true)
  assert.equal(stops, 1)
  assert.equal(web.complete(utterance), false)
  advance(100)
  assert.equal(permit.isCurrent(), true)
  assert.equal(web.complete(other), true)
  web.close(); c.close()
})

test('failing stop closes authority and reentrant output cannot obtain a second permission', () => {
  const { coordinator: c } = fixture()
  let permissionDuringStop
  const web = new adapters.WebEmbodiment(c, { stop: () => {
    permissionDuringStop = c.permit('robot', c.snapshot().lease.leaseId)
    throw new Error('device output did not stop')
  } })
  web.present(web.permit(), utterance, () => {})
  assert.equal(c.acquireRobot(c.snapshot().lease.leaseId, robot), undefined)
  assert.equal(permissionDuringStop, undefined)
  assert.equal(c.snapshot().phase, 'closed')
})

test('idle cleanup retains a robot renewed by heartbeats; another user never shares its coordinator', () => {
  const { clock, advance } = fixture()
  const registry = new sessions.EmbodimentSessions({ maxSessions: 1, idleMs: 100, ttlMs: 100, clock })
  const c = registry.forUser(user), lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  advance(90); c.heartbeat(lease.leaseId, robot)
  advance(150)
  assert.equal(registry.forUser(other), undefined)
  assert.equal(c.snapshot().phase, 'robot')
  advance(190)
  assert.ok(registry.forUser(other))
  assert.equal(c.snapshot().phase, 'closed')
  registry.close()
})
