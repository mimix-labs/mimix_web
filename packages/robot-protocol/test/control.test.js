import assert from 'node:assert/strict'
import test from 'node:test'
import * as protocol from '../dist/index.js'
const sessionId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const intent = { schemaVersion: 1, intentId: '33333333-3333-4333-8333-333333333333', deviceId: sessionId, conversationId: sessionId, leaseId: sessionId, behavior: 'greet', issuedAt: 1000, expiresAt: 2000 }
const envelope = { schemaVersion: 1, sessionId, connectionId, sequence: 1, leaseExpiresAt: 3000, intent }
test('MQTT control envelopes bind session/connection/sequence to short semantic intents', () => {
  assert.deepEqual(protocol.robotControlEnvelopeSchema.parse(envelope), envelope)
  for (const value of [{ ...envelope, pwm: 1 }, { ...envelope, sequence: 0 }, { ...envelope, leaseExpiresAt: 1500 }, { ...envelope, intent: { ...intent, behavior: 'forward' } }, { ...envelope, intent: { ...intent, expiresAt: 3001 } }]) assert.equal(protocol.robotControlEnvelopeSchema.safeParse(value).success, false)
  assert.equal(protocol.robotControlRequestSchema.safeParse({ schemaVersion: 1, id: intent.intentId, controlSessionId: sessionId, behavior: 'greet', ttlMs: 2000 }).success, true)
  for (const extra of [{ topic: 'other' }, { deviceId: 'other' }, { leaseId: sessionId }, { expiresAt: 90000 }, { ttlMs: 2001 }]) assert.equal(protocol.robotControlRequestSchema.safeParse({ schemaVersion: 1, id: intent.intentId, controlSessionId: sessionId, behavior: 'greet', ...extra }).success, false)
})
test('topics have a fixed namespace and canonical session scope', () => {
  assert.equal(protocol.robotTopic(sessionId, 'intents'), `mimix/v1/devices/${sessionId}/intents`)
  assert.deepEqual(protocol.parseRobotTopic(`mimix/v1/devices/${sessionId}/ack`), { sessionId, channel: 'ack' })
  for (const topic of [`mimix/v1/devices/+/ack`, `mimix/v1/devices/${sessionId}/motor`, `other/${sessionId}/ack`, `mimix/v1/devices/${sessionId}/ack/extra`]) assert.equal(protocol.parseRobotTopic(topic), undefined)
})
test('application ACK has bounded meaning and cannot claim physical completion', () => {
  const ack = { schemaVersion: 1, sessionId, connectionId, intentId: intent.intentId, leaseId: intent.leaseId, sequence: 1, status: 'accepted', reason: 'ACCEPTED' }
  assert.deepEqual(protocol.robotControlAckSchema.parse(ack), ack)
  assert.equal(protocol.robotControlAckSchema.safeParse({ ...ack, status: 'executed' }).success, false)
  assert.equal(protocol.robotControlAckSchema.safeParse({ ...ack, reason: 'arbitrary provider response' }).success, false)
})
