import assert from 'node:assert/strict'
import test from 'node:test'
import * as protocol from '../dist/index.js'
const sessionId = '11111111-1111-4111-8111-111111111111', connectionId = '22222222-2222-4222-8222-222222222222'
function fixture() {
  let now = 1000, timer
  const events = [], output = { perform(intent, signal) { events.push({ action: intent.behavior, signal }) }, stop(reason) { events.push({ action: 'stop', reason }) } }
  const gateway = new protocol.GatewayGuard({ sessionId, deviceId: sessionId, connectionId, behaviors: ['greet', 'stop'], output, clock: { now: () => now, schedule(callback, ms) { timer = { callback, at: now + ms }; return () => { timer = undefined } } } })
  const envelope = (sequence = 1, behavior = 'greet') => ({ schemaVersion: 1, sessionId, connectionId, sequence, leaseExpiresAt: 3000,
    intent: { schemaVersion: 1, deviceId: sessionId, intentId: `33333333-3333-4333-8333-${String(sequence).padStart(12, '0')}`, conversationId: sessionId, leaseId: sessionId, behavior, issuedAt: 1000, expiresAt: 2000 } })
  return { gateway, envelope, events, output, advance(ms) { now += ms; if (timer?.at <= now) timer.callback() } }
}
test('gateway accepts semantic output once; duplicates ACK without extending its watchdog', () => {
  const { gateway, envelope, events, advance } = fixture()
  const ack = gateway.receive(envelope())
  assert.equal(ack.status, 'accepted')
  const performed = events.find(e => e.action === 'greet')
  advance(900); assert.deepEqual(gateway.receive(envelope()), ack)
  assert.equal(events.filter(e => e.action === 'greet').length, 1)
  advance(100); assert.equal(performed.signal.aborted, true); assert.equal(events.at(-1).action, 'stop')
  assert.equal(gateway.receive(envelope()).reason, 'EXPIRED')
})
test('gateway rejects expired, future, retained, wrong-connection and malformed control', () => {
  for (const mutation of ['expired', 'future', 'retained', 'connection', 'malformed']) {
    const { gateway, envelope, events, advance } = fixture(); const value = envelope()
    if (mutation === 'expired') advance(1000)
    if (mutation === 'future') value.intent.issuedAt = 1500
    if (mutation === 'connection') value.connectionId = sessionId
    if (mutation === 'malformed') value.intent.pwm = 255
    const ack = gateway.receive(value, mutation === 'retained')
    assert.notEqual(ack?.status, 'accepted', mutation)
    assert.equal(events.filter(e => e.action === 'greet').length, 0)
    assert.equal(events.at(-1).action, 'stop')
  }
})
test('gateway rejects out-of-order and changed-content replay and stops current output', () => {
  const { gateway, envelope, events } = fixture()
  gateway.receive(envelope(2))
  assert.equal(gateway.receive(envelope(1)).reason, 'OUT_OF_ORDER')
  const changed = envelope(3); changed.intent.intentId = envelope(2).intent.intentId
  assert.equal(gateway.receive(changed).reason, 'CONFLICT')
  assert.equal(events.filter(e => e.action === 'greet').length, 1)
  assert.equal(events.find(e => e.action === 'greet').signal.aborted, true)
})
test('unsupported behavior, explicit stop, disconnect and driver failure fail closed', () => {
  const { gateway, envelope, events } = fixture()
  assert.equal(gateway.receive(envelope(1, 'celebrate')).reason, 'UNSUPPORTED')
  assert.equal(gateway.receive(envelope(2, 'stop')).status, 'stopped')
  gateway.receive(envelope(3)); gateway.disconnect()
  assert.equal(events.find(e => e.action === 'greet').signal.aborted, true)
  assert.equal(gateway.receive(envelope(4)), undefined)
  const broken = fixture(); broken.output.perform = () => { throw new Error('driver') }
  assert.equal(broken.gateway.receive(broken.envelope()).reason, 'DRIVER_FAILED')
  assert.equal(broken.gateway.receive(broken.envelope(2)), undefined)
})

test('bounded dedup cache never evicts an accepted intent to allow replay', () => {
  const { gateway, envelope, events } = fixture()
  for (let n = 1; n <= 256; n++) assert.equal(gateway.receive(envelope(n, 'stop')).status, 'stopped')
  assert.equal(gateway.receive(envelope(257)).reason, 'CAPACITY')
  assert.equal(gateway.receive(envelope(1, 'stop')).status, 'stopped')
  assert.equal(events.some(e => e.action === 'greet'), false)
})
