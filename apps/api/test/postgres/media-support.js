import { createHash, randomBytes } from 'node:crypto'
import { fixture } from './support.js'
import { DeviceStore } from '../../dist/modules/devices/store.js'
import { DeviceTokens } from '../../dist/modules/devices/tokens.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'
import * as mediaModule from '../../dist/modules/media/service.js'
export async function mediaFixture(t, capabilities = ['presence:heartbeat', 'camera:webrtc', 'camera:mjpeg', 'microphone:publish', 'speaker:subscribe']) {
  const base = await fixture(t)
  const identity = { provider: 'clerk', issuer: 'https://media.test', subject: 'alice', sessionId: 'original' }
  const owner = await base.identities.resolve(identity), stranger = await base.identities.resolve({ ...identity, subject: 'bob' })
  const actor = { userId: owner.id, identity }, verification = { revoked: false }
  const devices = new DeviceStore(base.database, async () => { if (verification.revoked) throw new IdentityError(401) }, new DeviceTokens(randomBytes(32).toString('base64url')))
  async function connect() {
    const verifier = randomBytes(32).toString('base64url')
    const pair = await devices.createPairing(actor, { schemaVersion: 1, capabilities, challenge: createHash('sha256').update(verifier).digest('hex') })
    const device = await devices.exchange({ schemaVersion: 1, pairingId: pair.id, code: pair.code, verifier, capabilities: { schemaVersion: 1, deviceId: 'local', behaviors: [], camera: ['webrtc', 'mjpeg'], handLandmarks: false, speech: false, audio: { microphone: true, speaker: true } } })
    await devices.heartbeat(device.token, { schemaVersion: 1, sequence: 1 })
    return device
  }
  const calls = [], failure = { create: false, token: false, close: false, gate: undefined }
  const provider = {
    async createRoom(room) { calls.push({ action: 'create', room }); if (failure.create) throw new Error('private-provider-response') },
    async issueToken(join) { calls.push({ action: 'token', ...join }); if (failure.gate) await failure.gate; if (failure.token) throw new Error('private-provider-response'); return { token: 'opaque-media-test-token', expiresAt: join.expiresAt } },
    async closeRoom(room, identities) { calls.push({ action: 'close', room, identities }); if (failure.close) throw new Error('private-provider-response') },
  }
  const config = { provider: 'livekit', url: 'wss://media.livekit.cloud', apiKey: 'test', apiSecret: 'private-provider-secret', mode: 'cloud', lan: true, timeoutMs: 3000 }
  const service = new mediaModule.MediaService(base.database, devices, provider, config)
  const device = await connect()
  const request = tracks => ({ schemaVersion: 1, deviceSessionId: device.session.id, tracks: tracks ?? ['robot_camera', 'robot_microphone', 'robot_speaker'] })
  return { ...base, actor, stranger, devices, device, connect, service, provider, calls, failure, request, verification, config }
}
export const status = expected => error => { if (error.status !== expected) throw error; return true }
