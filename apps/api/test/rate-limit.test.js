import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApi } from '../dist/app.js'
import { parseEnvironment } from '../dist/config/environment.js'
import { createSecuredLegacy } from '../dist/security/legacy.js'
import { ClerkIdentityProvider } from '../dist/modules/identity/clerk.provider.js'

const issuer = 'https://rate-test.clerk.accounts.dev'
const origin = 'https://mimix.test'
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
function token(subject = 'alice', sessionId = 'session-one') {
  const now = Math.floor(Date.now() / 1000)
  const input = [{ alg: 'RS256', typ: 'JWT', kid: 'rate-test' }, { iss: issuer, azp: origin, sub: subject, sid: `${subject}:${sessionId}`, iat: now, nbf: now - 1, exp: now + 60 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url')}`
}
async function start(t, runtime, env = {}) {
  let sessionCalls = 0
  const provider = new ClerkIdentityProvider({ secretKey: 'sk_test_fixture', issuer, authorizedParties: [origin], jwtKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, {
    getSession: async id => { sessionCalls++; return { id, userId: id.split(':')[0], status: 'active', expireAt: Date.now() + 60000 } },
  })
  const config = parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: issuer, CLERK_AUTHORIZED_PARTIES: origin, MIMIX_ALLOWED_ORIGINS: origin, MIMIX_IDENTITY_FILE: '/unused/identity.json', MIMIX_ROBOT_BRIDGE_TOKEN: 'bridge', MIMIX_ROBOT_CONTROL_TOKEN: 'control', ...env })
  const dependencies = { provider, repository: { resolve: identity => ({ id: identity.subject, createdAt: '2026-10-04T00:00:00Z' }) } }
  let base
  if (runtime === 'nest') {
    const app = await createApi(config, dependencies)
    await app.listen(0, '127.0.0.1'); base = await app.getUrl()
    t.after(() => app.close())
  } else {
    const legacy = createSecuredLegacy(config, dependencies)
    const server = legacy.app.listen(0, '127.0.0.1')
    await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
    t.after(() => new Promise(resolve => { legacy.close(); server.close(resolve) }))
  }
  return {
    sessionCalls: () => sessionCalls,
    async request(path, headers = {}, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(base + path, { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
      await response.text()
      return response
    },
  }
}
const bridge = { 'x-mimix-robot-token': 'bridge' }
const control = { 'x-mimix-control-token': 'control' }
const frame = { landmarks: [], handedness: [] }

for (const runtime of ['nest', 'express']) {
  test(`${runtime}: exhausted anonymous/unknown traffic cannot spend valid user, operator or bridge quotas`, async t => {
    const api = await start(t, runtime, { MIMIX_RATE_LIMIT: '2', MIMIX_RATE_LIMIT_ANONYMOUS: '2' })
    for (let i = 0; i < 2; i++) assert.equal((await api.request(`/api/unknown-${i}`)).status, 404)
    assert.equal((await api.request('/api/another-unknown', { 'x-forwarded-for': '1.2.3.4' })).status, 429)
    for (let i = 0; i < 3; i++) {
      await api.request('/api/identity/me')
      await api.request('/api/identity/me', { authorization: `Bearer invalid-${i}` })
      await api.request('/api/robot/status', { 'x-mimix-control-token': `wrong-${i}` })
      await api.request('/api/robot/context', { 'x-mimix-robot-token': `wrong-${i}` })
    }
    assert.equal((await api.request('/api/identity/me', { authorization: `Bearer ${token()}` })).status, 200)
    assert.equal((await api.request('/api/robot/status', control)).status, 200)
    assert.equal((await api.request('/api/robot/context', bridge)).status, 200)
    for (let i = 0; i < 3; i++) await api.request(`/api/preflight-unknown-${i}`, {}, undefined, 'OPTIONS')
    for (const [path, method] of [['/api/identity/me', 'GET'], ['/api/robot/motion', 'POST'], ['/api/robot/context', 'GET']]) {
      const preflight = await api.request(path, { origin, 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type,x-mimix-control-token,x-mimix-robot-token' }, undefined, 'OPTIONS')
      assert.equal(preflight.status, 204, `preflight must not block ${path}`)
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
    }
  })

  for (const mode of ['legacy', 'clerk']) {
    test(`${runtime}/${mode}: default quota accepts 1800 landmarks/minute plus 20 percent margin without blocking other routes`, async t => {
      const api = await start(t, runtime, { MIMIX_AUTH_MODE: mode })
      for (let i = 0; i < 2160; i++) {
        const response = await api.request('/api/vision/hand-landmarks', mode === 'clerk' ? bridge : {}, frame)
        assert.equal(response.status, 202, `frame ${i + 1}`)
      }
      assert.equal((await api.request('/api/robot/context', bridge)).status, 200)
      assert.equal((await api.request('/api/robot/status', control)).status, 200)
      if (mode === 'clerk') assert.equal((await api.request('/api/identity/me', { authorization: `Bearer ${token()}` })).status, 200)
    })
  }

  test(`${runtime}: quotas bind to verified subject and canonical route, ahead of session lookup, regardless of token or IP rotation`, async t => {
    const api = await start(t, runtime, { MIMIX_RATE_LIMIT_USER: '2', MIMIX_RATE_LIMIT_MACHINE: '2', MIMIX_RATE_LIMIT_LANDMARKS: '2' })
    for (let i = 0; i < 2; i++) assert.equal((await api.request('/api/identity/me', { authorization: `Bearer ${token('alice', String(i))}` })).status, 200)
    assert.equal(api.sessionCalls(), 2)
    const blocked = await api.request('/API/identity/me/?changed=true', { authorization: `Bearer ${token('alice', 'rotated')}`, 'x-forwarded-for': '9.8.7.6' })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    assert.equal(api.sessionCalls(), 2, 'quota must stop BAPI after local signature verification')
    assert.equal((await api.request('/api/identity/me', { authorization: `Bearer ${token('bob')}` })).status, 200)
    assert.equal((await api.request('/api/challenges/events', { authorization: `Bearer ${token()}` }, { challenge: 'science', type: 'started' })).status, 202)
    for (let i = 0; i < 2; i++) assert.equal((await api.request('/api/robot/status', control)).status, 200)
    assert.equal((await api.request('/API/robot/status/', { ...control, 'x-forwarded-for': '1.1.1.1' })).status, 429)
    assert.equal((await api.request('/api/vision/status', control)).status, 200)
    for (let i = 0; i < 2; i++) assert.equal((await api.request('/api/vision/hand-landmarks', bridge, frame)).status, 202)
    assert.equal((await api.request('/api/vision/hand-landmarks', { ...bridge, 'x-forwarded-for': '2.2.2.2' }, frame)).status, 429)
    assert.equal((await api.request('/api/robot/context', bridge)).status, 200)
  })
}

test('rate quotas reject malformed, zero and unsafe values for every configurable class', () => {
  for (const field of ['MIMIX_RATE_LIMIT_ANONYMOUS', 'MIMIX_RATE_LIMIT_USER', 'MIMIX_RATE_LIMIT_MACHINE', 'MIMIX_RATE_LIMIT_LANDMARKS']) {
    for (const value of ['0', '-1', '2junk', '100001', '']) assert.throws(() => parseEnvironment({ [field]: value }), new RegExp(field))
  }
})

test('anonymous pool saturation cannot fill authenticated pools; fixed windows expire', async t => {
  const { HttpSecurityPolicy } = await import('../dist/security/policy.js')
  const config = parseEnvironment({ MIMIX_ROBOT_BRIDGE_TOKEN: 'bridge', MIMIX_ROBOT_CONTROL_TOKEN: 'control', MIMIX_RATE_LIMIT_MACHINE: '1' })
  const policy = new HttpSecurityPolicy(config)
  const request = { method: 'GET', url: '/api/unknown', headers: {}, ip: 'transport-peer' }
  t.mock.timers.enable({ apis: ['Date'], now: 100000 })
  for (let i = 0; i < 10000; i++) assert.equal((await policy.authorize({ ...request, ip: String(i) })).status, 404)
  const full = await policy.authorize(request)
  assert.equal(full.status, 429)
  assert.equal(full.headers['retry-after'], '60')
  const machine = { ...request, url: '/api/robot/context', headers: bridge }
  assert.equal((await policy.authorize(machine)).status, undefined)
  assert.equal((await policy.authorize(machine)).status, 429)
  t.mock.timers.tick(60000)
  assert.equal((await policy.authorize(request)).status, 404)
  assert.equal((await policy.authorize(machine)).status, undefined)
})

test('OpenAPI reports effective actor/route quotas and the separate telemetry allowance', async t => {
  const app = await createApi(parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_RATE_LIMIT_LANDMARKS: '4200' }))
  t.after(() => app.close())
  await app.listen(0, '127.0.0.1')
  const document = await (await fetch((await app.getUrl()) + '/api/openapi.json')).json()
  const telemetry = document.paths['/api/vision/hand-landmarks'].post['x-rate-limit']
  assert.ok(telemetry, 'effective quota must be published')
  assert.equal(telemetry.windowSeconds, 60)
  assert.equal(telemetry.limit, 4200)
  assert.equal(telemetry.anonymousFailureLimit, 60)
  assert.ok(document.paths['/api/identity/me'].get.responses['429'])
})
