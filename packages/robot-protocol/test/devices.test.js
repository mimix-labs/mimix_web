import assert from 'node:assert/strict'
import test from 'node:test'
import * as protocol from '../dist/index.js'

const capabilities = { schemaVersion: 1, deviceId: 'local-untrusted-label', behaviors: ['stop'], camera: ['mjpeg'], handLandmarks: true, speech: false }
test('pairing binds a proof challenge to a unique, bounded capability approval', () => {
  const request = { schemaVersion: 1, challenge: 'a'.repeat(64), capabilities: ['presence:heartbeat', 'behavior:stop'] }
  assert.deepEqual(protocol.devicePairingRequestSchema.parse(request), request)
  for (const change of [{ challenge: 'short' }, { capabilities: ['presence:heartbeat', 'pwm'] }, { capabilities: ['presence:heartbeat', 'presence:heartbeat'] }, { capabilities: ['speech:play'] }, { userId: 'injected' }, { schemaVersion: 2 }]) assert.equal(protocol.devicePairingRequestSchema.safeParse({ ...request, ...change }).success, false)
})
test('exchange requires both a code and a robot verifier; user credentials are not accepted', () => {
  const request = { schemaVersion: 1, pairingId: '5131c7eb-9102-435f-8999-62ca053fd2ed', code: 'c'.repeat(22), verifier: 'v'.repeat(43), capabilities }
  assert.deepEqual(protocol.deviceExchangeRequestSchema.parse(request), request)
  for (const change of [{ verifier: '' }, { code: '123456' }, { token: 'user-jwt' }, { pairingId: 'not-uuid' }]) assert.equal(protocol.deviceExchangeRequestSchema.safeParse({ ...request, ...change }).success, false)
})
test('device heartbeat has a bounded sequence and no client timestamps or identity claims', () => {
  assert.deepEqual(protocol.deviceHeartbeatSchema.parse({ schemaVersion: 1, sequence: 1 }), { schemaVersion: 1, sequence: 1 })
  for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(protocol.deviceHeartbeatSchema.safeParse({ schemaVersion: 1, sequence }).success, false)
  assert.equal(protocol.deviceHeartbeatSchema.safeParse({ schemaVersion: 1, sequence: 1, expiresAt: 999999 }).success, false)
})
test('advertised capabilities constrain grants without treating the supplied label as device identity', () => {
  assert.deepEqual(protocol.supportedDeviceCapabilities(capabilities), ['presence:heartbeat', 'context:read', 'vision:publish', 'camera:mjpeg', 'behavior:stop'])
})
