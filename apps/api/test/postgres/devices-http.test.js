import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { fixture } from './support.js'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'

async function start(t, runtime, url, enabled = true, extra = {}) {
  const config = parseEnvironment({ MIMIX_DEVICE_SESSIONS_ENABLED: String(enabled), MIMIX_DATA_STORE: 'postgres', DATABASE_URL: url, MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://device.test', CLERK_AUTHORIZED_PARTIES: 'https://device.test', MIMIX_ALLOWED_ORIGINS: 'https://device.test', LOG_LEVEL: 'silent', ...extra })
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
    const app = await createApi(config, { provider }); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); t.after(() => app.close())
  } else {
    const app = createSecuredLegacy(config, { provider }), server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() })
  }
  const request = async (path, { body, authorization = 'Bearer alice', method = body ? 'POST' : 'GET', headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { authorization, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const raw = await r.text(); return { status: r.status, headers: r.headers, body: raw ? JSON.parse(raw) : undefined }
  }
  const pair = async () => {
    const verifier = randomBytes(32).toString('base64url')
    const invitation = await request('/api/devices/pairings', { body: { schemaVersion: 1, challenge: createHash('sha256').update(verifier).digest('hex'), capabilities: ['presence:heartbeat', 'behavior:stop'] } })
    assert.equal(invitation.status, 201)
    const exchange = { schemaVersion: 1, pairingId: invitation.body.id, code: invitation.body.code, verifier, capabilities: { schemaVersion: 1, deviceId: 'local', behaviors: ['stop'], camera: [], handLandmarks: false, speech: false } }
    const result = await request('/api/devices/exchange', { body: exchange, authorization: '' })
    assert.equal(result.status, 201)
    return { ...result.body, exchange }
  }
  return { request, pair, revoked }
}
for (const runtime of ['nest', 'express']) {
  test(`${runtime}: device credentials are separate, session/capability authorization and revocation work over HTTP`, async t => {
    const { url } = await fixture(t), { request, pair, revoked } = await start(t, runtime, url)
    const p = await pair(), authorization = `Device ${p.token}`, path = `/api/devices/sessions/${p.session.id}`
    const first = await request('/API/DEVICES/HEARTBEAT/', { authorization, body: { schemaVersion: 1, sequence: 1 } })
    assert.equal(first.status, 200); assert.equal(first.headers.get('cache-control'), 'no-store')
    assert.equal((await request('/api/devices/heartbeat', { authorization, body: { schemaVersion: 1, sequence: 1 } })).status, 409)
    assert.equal((await request(`${path}/authorize`, { body: { schemaVersion: 1, capability: 'behavior:stop' } })).status, 200)
    assert.equal((await request(`${path}/authorize`, { authorization: 'Bearer alice-new', body: { schemaVersion: 1, capability: 'behavior:stop' } })).status, 403)
    assert.equal((await request(path, { authorization: 'Bearer bob' })).status, 404)
    assert.equal((await request('/api/devices/self')).status, 401)
    assert.equal((await request('/api/identity/me', { authorization })).status, 401)
    assert.equal((await request('/api/devices/self', { authorization: '', headers: { 'x-mimix-robot-token': p.token } })).status, 401)
    assert.equal((await request('/api/devices/exchange', { authorization: '', body: p.exchange })).status, 401)
    assert.equal((await request('/api/devices/self', { authorization, method: 'HEAD' })).status, 200)
    assert.equal((await request('/api/devices/heartbeat', { authorization, body: { schemaVersion: 1, sequence: 2, userId: 'bob' } })).status, 400)
    assert.equal((await request('/api/devices/heartbeat', { authorization, body: { padding: 'x'.repeat(18000) } })).status, 413)
    assert.equal((await request('/api/devices/self', { authorization, headers: { origin: 'https://evil.test' } })).status, 403)
    assert.equal((await request(path, { authorization: 'Bearer alice-new', method: 'DELETE' })).body.status, 'revoked')
    assert.equal((await request('/api/devices/self', { authorization })).status, 401)
    const another = await pair(); revoked.add('alice')
    assert.equal((await request('/api/devices/self', { authorization: `Device ${another.token}` })).status, 401)
    const audit = await request('/api/devices/audit', { authorization: 'Bearer alice-new' })
    assert.equal(audit.status, 200); assert.ok(audit.body.items.some(i => i.reason === 'identity_revoked'))
    const listing = await request('/api/devices/sessions', { authorization: 'Bearer alice-new' })
    assert.equal(listing.status, 200); assert.equal(listing.body.items.length, 2)
    const docs = await request('/api/openapi.json')
    assert.ok(docs.body.paths['/api/devices/exchange'])
    assert.ok(docs.body.components.securitySchemes.DeviceToken)
    for (const secret of [p.token, p.exchange.code, p.exchange.verifier, 'sessionHash', 'sessionId":"alice']) assert.equal(JSON.stringify(audit.body).includes(secret), false)
  })
  test(`${runtime}: invalid clients behind the same proxy cannot exhaust a verified device quota`, async t => {
    const { url } = await fixture(t), { request, pair } = await start(t, runtime, url, true, { MIMIX_RATE_LIMIT_ANONYMOUS: '2', MIMIX_RATE_LIMIT_MACHINE: '2' })
    const p = await pair(), other = await pair(), authorization = `Device ${p.token}`
    for (const invalid of ['', `Device ${'x'.repeat(43)}`, `Device ${'y'.repeat(43)}`]) await request('/api/devices/self', { authorization: invalid })
    assert.equal((await request('/api/devices/heartbeat', { authorization, body: { schemaVersion: 1, sequence: 1 } })).status, 200)
    assert.equal((await request('/api/devices/self', { authorization })).status, 200)
    assert.equal((await request('/api/devices/self', { authorization })).status, 429)
    assert.equal((await request('/api/devices/heartbeat', { authorization: `Device ${other.token}`, body: { schemaVersion: 1, sequence: 1 } })).status, 200)
  })
  test(`${runtime}: devices disabled by default and pairing quota is bounded`, async t => {
    const { url } = await fixture(t), disabled = await start(t, runtime, url, false)
    assert.equal((await disabled.request('/api/devices/sessions')).status, 404)
    assert.equal((await disabled.request('/api/openapi.json')).body.paths['/api/devices/exchange'], undefined)
    const { request } = await start(t, runtime, url)
    for (let n = 0; n < 10; n++) assert.equal((await request('/api/devices/pairings', { body: { schemaVersion: 1, challenge: 'a'.repeat(64), capabilities: ['presence:heartbeat'] } })).status, 201)
    assert.equal((await request('/api/devices/pairings', { body: { schemaVersion: 1, challenge: 'a'.repeat(64), capabilities: ['presence:heartbeat'] } })).status, 429)
    assert.equal((await request('/api/devices/audit?after=invalid')).status, 400)
  })
}
