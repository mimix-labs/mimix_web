import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { fixture } from './support.js'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'

export async function start(t, runtime, url, enabled = true, extra = {}, mediaProvider) {
  const config = parseEnvironment({ MIMIX_DEVICE_TOKEN_KEY: 'AQ'.repeat(21) + 'A', MIMIX_DEVICE_SESSIONS_ENABLED: String(enabled), MIMIX_DATA_STORE: 'postgres', DATABASE_URL: url, MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://device.test', CLERK_AUTHORIZED_PARTIES: 'https://device.test', MIMIX_ALLOWED_ORIGINS: 'https://device.test', LOG_LEVEL: 'silent', ...extra })
  const revoked = new Set()
  const provider = {
    async verifyToken(token) {
      if (!['alice', 'alice-new', 'bob'].includes(token)) throw new IdentityError(401)
      return { provider: 'clerk', issuer: config.clerk.issuer, subject: token.startsWith('alice') ? 'alice' : token, sessionId: token }
    },
    async verifySession(identity) { if (revoked.has(identity.sessionId)) throw new IdentityError(401) },
  }
  let base
  if (runtime === 'nest') {
    const app = await createApi(config, { provider, mediaProvider }); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); t.after(() => app.close())
  } else {
    const app = createSecuredLegacy(config, { provider, mediaProvider }), server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() })
  }
  const request = async (path, { body, authorization = 'Bearer alice', method = body ? 'POST' : 'GET', headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { authorization, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const raw = await r.text(); return { status: r.status, headers: r.headers, body: raw ? JSON.parse(raw) : undefined }
  }
  const pair = async () => {
    const verifier = randomBytes(32).toString('base64url')
    const invitation = await request('/api/devices/pairings', { body: { schemaVersion: 1, challenge: createHash('sha256').update(verifier).digest('hex'), capabilities: ['presence:heartbeat', 'camera:webrtc', 'camera:mjpeg', 'microphone:publish', 'speaker:subscribe'] } })
    assert.equal(invitation.status, 201)
    const exchange = { schemaVersion: 1, pairingId: invitation.body.id, code: invitation.body.code, verifier, capabilities: { schemaVersion: 1, deviceId: 'local', behaviors: ['stop'], camera: ['webrtc', 'mjpeg'], handLandmarks: false, speech: false, audio: { microphone: true, speaker: true } } }
    const result = await request('/api/devices/exchange', { body: exchange, authorization: '' })
    assert.equal(result.status, 201)
    return { ...result.body, exchange }
  }
  return { request, pair, revoked }
}
