import assert from 'node:assert/strict'
import test from 'node:test'
import * as media from '../dist/index.js'
const id = '11111111-1111-4111-8111-111111111111'
test('media requests select approved tracks, never room names, identities, URLs or grants', () => {
  const input = { schemaVersion: 1, deviceSessionId: id, tracks: ['robot_camera'] }
  assert.deepEqual(media.mediaRequestSchema.parse(input), input)
  for (const change of [{ room: 'other-user' }, { identity: 'admin' }, { url: 'http://evil.test' }, { canPublish: true }, { tracks: [] }, { tracks: ['robot_camera', 'robot_camera'] }, { tracks: ['screen_share'] }, { schemaVersion: 2 }]) assert.equal(media.mediaRequestSchema.safeParse({ ...input, ...change }).success, false)
})
test('robot camera, microphone and speaker produce disjoint least-privilege participant plans', () => {
  assert.deepEqual(media.participantPermissions(['robot_camera'], 'robot'), { publish: ['camera'], subscribe: false })
  assert.deepEqual(media.participantPermissions(['robot_camera'], 'user'), { publish: [], subscribe: true })
  assert.deepEqual(media.participantPermissions(['robot_microphone'], 'robot'), { publish: ['microphone'], subscribe: false })
  assert.deepEqual(media.participantPermissions(['robot_speaker'], 'robot'), { publish: [], subscribe: true })
  assert.deepEqual(media.participantPermissions(['robot_speaker'], 'user'), { publish: ['microphone'], subscribe: false })
  assert.deepEqual(media.requiredDeviceCapabilities(['robot_camera', 'robot_microphone', 'robot_speaker']), ['camera:webrtc', 'microphone:publish', 'speaker:subscribe'])
})
test('disconnection, degradation and exact lease expiry stop every capture/playback output', () => {
  const tracks = ['robot_camera', 'robot_microphone', 'robot_speaker']
  assert.deepEqual(media.mediaOutputPolicy(tracks, 'connected', 1000, 999), { camera: true, microphone: true, speaker: true })
  for (const state of ['connecting', 'disconnected', 'degraded']) assert.deepEqual(media.mediaOutputPolicy(tracks, state, 1000, 999), { camera: false, microphone: false, speaker: false })
  assert.deepEqual(media.mediaOutputPolicy(tracks, 'connected', 1000, 1000), { camera: false, microphone: false, speaker: false })
  assert.deepEqual(media.mediaOutputPolicy(['robot_camera'], 'connected', 1000, 999), { camera: true, microphone: false, speaker: false })
})
test('fallback describes existing LAN operator authorization and cannot carry audio, tokens or arbitrary URLs', () => {
  const fallback = { transport: 'mjpeg', scope: 'lan', streamPath: '/api/vision/video', authentication: 'operator', audio: false }
  assert.deepEqual(media.mjpegFallbackSchema.parse(fallback), fallback)
  for (const change of [{ audio: true }, { token: 'secret' }, { streamPath: 'http://evil.test' }, { authentication: 'media-token' }]) assert.equal(media.mjpegFallbackSchema.safeParse({ ...fallback, ...change }).success, false)
})
