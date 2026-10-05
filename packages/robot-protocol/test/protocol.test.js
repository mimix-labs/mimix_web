import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as protocol from '../dist/index.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/legacy.json', import.meta.url)))
const id = '0be5f420-4317-4aee-8034-9c93f3c82885'
const capabilities = { schemaVersion: 1, deviceId: 'robot-dev-001', behaviors: ['celebrate', 'stop'], camera: ['mjpeg'], handLandmarks: true, speech: false }
const intent = { schemaVersion: 1, intentId: id, deviceId: 'robot-dev-001', conversationId: id, leaseId: id, behavior: 'celebrate', issuedAt: 1000, expiresAt: 3000 }

test('legacy fixtures retain unversioned Python producer/consumer payloads', () => {
  assert.deepEqual(protocol.legacyContextSchema.parse(fixture.context), fixture.context)
  assert.deepEqual(protocol.legacyNavigationSchema.parse(fixture.navigation), fixture.navigation)
  assert.deepEqual(protocol.legacyHandFrameSchema.parse(fixture.emptyHands), fixture.emptyHands)
  assert.deepEqual(protocol.parseLegacyMotion(fixture.motion, 1700000003000), fixture.motion)
})

test('motion matches Python expiry, id, action and 100–500 ms boundaries', () => {
  for (const duration of [100, 300, 500]) assert.equal(protocol.parseLegacyMotion({ ...fixture.motion, maxDurationMs: duration }, 1700000003000).maxDurationMs, duration)
  for (const override of [{ maxDurationMs: 99 }, { maxDurationMs: 501 }, { maxDurationMs: 100.5 }, { id: '' }, { action: 'pwm' }, { expiresAt: 1700000002999 }, { expiresAt: 1.5 }]) {
    assert.throws(() => protocol.parseLegacyMotion({ ...fixture.motion, ...override }, 1700000003000))
  }
  // The robot neither requires issuedAt nor assumes a UUID; don't narrow its wire.
  const { issuedAt, ...minimal } = fixture.motion
  assert.equal(protocol.parseLegacyMotion({ ...minimal, id: 'python-id', extension: true }, 0).id, 'python-id')
})

test('landmarks preserve nested handedness and out-of-image coordinates from MediaPipe', () => {
  const frame = { ...fixture.emptyHands, landmarks: [Array.from({ length: 21 }, () => ({ x: -0.1, y: 1.1, z: -0.2 }))], handedness: [[{ categoryName: 'Left', score: 0.99 }]] }
  assert.deepEqual(protocol.legacyHandFrameSchema.parse(frame), frame)
  assert.equal(protocol.legacyHandFrameSchema.safeParse({ ...frame, handedness: [] }).success, false)
  assert.equal(protocol.legacyHandFrameSchema.safeParse({ ...frame, landmarks: [[{ x: 0, y: 0, z: 0 }]] }).success, false)
})

test('v1 capabilities and presence are device-specific and reject unknown versions', () => {
  assert.deepEqual(protocol.robotCapabilitiesSchema.parse(capabilities), capabilities)
  const presence = { schemaVersion: 1, deviceId: 'robot-dev-001', connectionId: id, sequence: 1, state: 'online', observedAt: 1000, expiresAt: 6000 }
  assert.deepEqual(protocol.robotPresenceSchema.parse(presence), presence)
  for (const override of [{ schemaVersion: 2 }, { sequence: 0 }, { expiresAt: 1000 }, { deviceId: '' }]) assert.equal(protocol.robotPresenceSchema.safeParse({ ...presence, ...override }).success, false)
  assert.equal(protocol.robotCapabilitiesSchema.safeParse({ ...capabilities, behaviors: ['pwm'] }).success, false)
  assert.equal(protocol.robotCapabilitiesSchema.safeParse({ ...capabilities, behaviors: ['stop', 'stop'] }).success, false)
})

test('camera describes availability and transport, never credentials or arbitrary URLs', () => {
  for (const camera of [
    { schemaVersion: 1, deviceId: 'robot-dev-001', state: 'unavailable' },
    { schemaVersion: 1, deviceId: 'robot-dev-001', state: 'available', transport: 'mjpeg', streamPath: '/api/vision/video' },
    { schemaVersion: 1, deviceId: 'robot-dev-001', state: 'available', transport: 'webrtc', trackId: 'camera-1' },
  ]) assert.deepEqual(protocol.robotCameraSchema.parse(camera), camera)
  assert.equal(protocol.robotCameraSchema.safeParse({ schemaVersion: 1, deviceId: 'r', state: 'available', transport: 'mjpeg', streamPath: 'http://remote/?token=secret' }).success, false)
})

test('BehaviorIntent is bounded semantic input with a lease reference, not motor control', () => {
  assert.deepEqual(protocol.behaviorIntentSchema.parse(intent), intent)
  for (const override of [{ behavior: 'forward' }, { pwm: 255 }, { leaseId: '' }, { expiresAt: 1000 }, { expiresAt: 11001 }, { schemaVersion: 2 }]) assert.equal(protocol.behaviorIntentSchema.safeParse({ ...intent, ...override }).success, false)
})

test('HTTP and SSE use the same bridge header and never operator or user credentials', () => {
  assert.deepEqual(protocol.bridgeHeaders('secret'), { Accept: 'application/json', 'X-Mimix-Robot-Token': 'secret' })
  assert.deepEqual(protocol.bridgeHeaders('secret', true), { Accept: 'text/event-stream', 'X-Mimix-Robot-Token': 'secret', 'Cache-Control': 'no-cache' })
  assert.deepEqual(protocol.bridgeHeaders(''), { Accept: 'application/json' })
  assert.throws(() => protocol.bridgeHeaders('bad\r\nheader'))
})
