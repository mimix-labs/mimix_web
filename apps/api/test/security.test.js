import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnvironment } from '../dist/config/environment.js'
import { createApi } from '../dist/app.js'

const environment = { LOG_LEVEL: 'silent', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_placeholder', CLERK_ISSUER: 'https://test.clerk.accounts.dev', MIMIX_ALLOWED_ORIGINS: 'https://mimix.test', CLERK_AUTHORIZED_PARTIES: 'https://mimix.test', MIMIX_IDENTITY_FILE: '/unused/test.json', MIMIX_ROBOT_BRIDGE_TOKEN: 'bridge', MIMIX_ROBOT_CONTROL_TOKEN: 'control' }
test('secure configuration is explicit and never discloses supplied secrets', () => {
  for (const values of [
    { MIMIX_AUTH_MODE: 'typo' }, { ...environment, CLERK_SECRET_KEY: '' },
    { ...environment, MIMIX_IDENTITY_FILE: '' }, { ...environment, CLERK_ISSUER: 'http://evil.test' },
    { ...environment, MIMIX_ALLOWED_ORIGINS: '*' }, { ...environment, CLERK_AUTHORIZED_PARTIES: '' },
    { ...environment, MIMIX_RATE_LIMIT: '0' }, { ...environment, MIMIX_ALLOWED_ORIGINS: 'https://mimix.test/path' },
    { NODE_ENV: 'production', MIMIX_ALLOWED_ORIGINS: '' },
  ]) assert.throws(() => parseEnvironment(values), /Invalid configuration:/)
  assert.equal(parseEnvironment(environment).authMode, 'clerk')
})

for (const runtime of ['nest', 'express']) {
  test(`${runtime}: private by default, identity, role separation, CORS and revocation`, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'mimix-security-'))
    const config = parseEnvironment({ ...environment, MIMIX_IDENTITY_FILE: join(dir, 'users.json') })
    let valid = true
    const provider = { authenticate: async value => {
      const { IdentityError } = await import('../dist/modules/identity/identity.contract.js')
      if (value !== 'test-user-token' || !valid) throw new IdentityError(401)
      return { provider: 'clerk', issuer: environment.CLERK_ISSUER, subject: 'user_one', sessionId: 'sess_one' }
    } }
    let base, close
    if (runtime === 'nest') {
      const app = await createApi(config, { provider })
      await app.listen(0, '127.0.0.1'); base = await app.getUrl(); close = () => app.close()
    } else {
      const { createSecuredLegacy } = await import('../dist/security/legacy.js')
      const { once } = await import('node:events')
      const legacy = createSecuredLegacy(config, { provider })
      const server = legacy.app.listen(0, '127.0.0.1')
      await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
      close = () => new Promise(resolve => { legacy.close(); server.close(resolve) })
    }
    t.after(async () => { await close(); rmSync(dir, { recursive: true, force: true }) })
    const request = (path, options = {}) => fetch(base + path, options)
    // Raw absolute-form targets are accepted by Express's parser; policy must reject them first.
    const { request: rawRequest } = await import('node:http')
    for (const [method, path] of [['GET', '/api/robot/status'], ['POST', '/api/challenges/events']]) {
      const response = await new Promise((resolve, reject) => {
        const req = rawRequest(base, { method, path: `http://localhost${path}`, headers: { 'content-type': 'application/json' } }, res => {
          res.resume(); res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.end(method === 'POST' ? JSON.stringify({ challenge: 'science', type: 'started' }) : undefined)
      })
      assert.equal(response, 400, `absolute-form ${method} ${path}`)
    }
    assert.equal((await request('/api/health')).status, 200)
    for (const path of ['/api/identity/me', '/API/identity/me/', '/api/identity/me?token=test-user-token']) assert.equal((await request(path)).status, 401)
    assert.equal((await request('/api/identity/me', { headers: { cookie: '__session=test-user-token' } })).status, 401)
    const userHeaders = { authorization: 'Bearer test-user-token' }
    const first = await request('/api/identity/me', { headers: userHeaders })
    assert.equal(first.status, 200)
    const user = await first.json()
    assert.match(user.id, /^[0-9a-f-]{36}$/)
    assert.equal(JSON.stringify(user).includes('user_one'), false)
    assert.deepEqual(await (await request('/API/identity/me/', { headers: userHeaders })).json(), user)
    assert.equal((await request('/api/robot/context', { method: 'POST', headers: userHeaders })).status, 401)
    assert.equal((await request('/api/vision/hand-landmarks', { method: 'POST', headers: userHeaders })).status, 401)
    assert.equal((await request('/api/robot/context', { headers: { 'x-mimix-control-token': 'control' } })).status, 401)
    assert.equal((await request('/api/robot/context', { headers: { 'x-mimix-robot-token': 'bridge' } })).status, 200)
    assert.equal((await request('/api/identity/me', { headers: { 'x-mimix-robot-token': 'bridge' } })).status, 401)
    assert.equal((await request('/api/new-private-route', { headers: userHeaders })).status, 404)
    const event = { method: 'POST', headers: { ...userHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ challenge: 'science', type: 'started' }) }
    assert.equal((await request('/api/challenges/events', event)).status, 202)
    valid = false
    assert.equal((await request('/api/challenges/events', event)).status, 401)
    assert.equal((await request('/api/identity/me', { headers: userHeaders })).status, 401)
    const denied = await request('/api/health', { headers: { origin: 'https://evil.test' } })
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
    for (const path of ['/api/identity/me', '/api/robot/context']) {
      const preflight = await request(path, { method: 'OPTIONS', headers: { origin: 'https://mimix.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
      assert.equal(preflight.status, 204)
      assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://mimix.test')
    }
  })
}

test('rate limit precedes provider calls and ignores spoofed forwarding headers', async t => {
  let calls = 0
  const app = await createApi(parseEnvironment({ ...environment, MIMIX_RATE_LIMIT: '2' }), { provider: { authenticate: async () => { calls++; throw new Error('secret') } } })
  t.after(() => app.close()); await app.listen(0, '127.0.0.1')
  const base = await app.getUrl()
  for (let n = 0; n < 2; n++) await fetch(base + '/api/identity/me', { headers: { authorization: 'Bearer invalid' } })
  const blocked = await fetch(base + '/api/identity/me', { headers: { authorization: 'Bearer invalid', 'x-forwarded-for': '1.2.3.4' } })
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  assert.equal(calls, 2)
  assert.equal((await fetch(base + '/api/health')).status, 200)
})

test('unlisted native handlers stay inaccessible in compatibility and Clerk modes', async t => {
  for (const mode of ['legacy', 'clerk']) {
    const app = await createApi(parseEnvironment({ ...environment, MIMIX_AUTH_MODE: mode }), { repository: { resolve: () => { throw new Error('must not map') } }, provider: { authenticate: async () => { throw new Error('must not authenticate') } } })
    app.getHttpAdapter().get('/api/new-private-route', () => ({ private: 'must not escape' }))
    t.after(() => app.close())
    await app.listen(0, '127.0.0.1')
    const response = await fetch((await app.getUrl()) + '/api/new-private-route')
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'not found' })
  }
})

test('direct legacy launcher refuses Clerk mode instead of silently serving public writes', async () => {
  const { createLegacyApp } = await import('../../../server/src/legacy.js')
  assert.throws(() => createLegacyApp({ env: { MIMIX_AUTH_MODE: 'clerk' } }), /secured API entrypoint/)
})

test('OpenAPI describes the active security mode for every legacy route', async t => {
  const app = await createApi(parseEnvironment(environment), { repository: { resolve: () => { throw new Error('unused') } }, provider: { authenticate: async () => { throw new Error('unused') } } })
  t.after(() => app.close())
  await app.listen(0, '127.0.0.1')
  const doc = await (await fetch((await app.getUrl()) + '/api/openapi.json')).json()
  assert.deepEqual(doc.paths['/api/challenges/events'].post.security, [{ bearer: [] }])
  assert.deepEqual(doc.paths['/api/vision/hand-landmarks'].post.security, [{ BridgeToken: [] }])
  assert.deepEqual(doc.paths['/api/robot/context'].get.security, [{ BridgeToken: [] }])
  assert.deepEqual(doc.paths['/api/robot/context'].post.security, [{ ControlToken: [] }])
  assert.deepEqual(doc.paths['/api/vision/stream'].get.security, [{ ControlToken: [] }])
  assert.deepEqual(doc.paths['/api/vision/config'].get.security, [])
})
