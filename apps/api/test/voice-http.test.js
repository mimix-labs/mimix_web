import { request as httpRequest } from 'node:http'
import { IdentityError } from '../dist/modules/identity/identity.contract.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createApi } from '../dist/app.js'
import { createSecuredLegacy } from '../dist/security/legacy.js'
import { parseEnvironment } from '../dist/config/environment.js'
import { VoiceService } from '../dist/modules/voice/service.js'
import { FakeVoiceProvider } from '../dist/modules/voice/fake.js'
const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const input = { schemaVersion: 1, id: '33333333-3333-4333-8333-333333333333', text: 'Un subtítulo privado' }
const environment = { LOG_LEVEL: 'silent', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://mimix.test', MIMIX_IDENTITY_FILE: '/unused/voice.json' }
async function start(t, runtime, voice, overrides = {}) {
  const config = parseEnvironment({ ...environment, ...overrides })
  const dependencies = { voice, provider: {
    async verifyToken(token) { if (!['one', 'two'].includes(token)) throw new IdentityError(401); return { provider: 'test', issuer: 'test', subject: token, sessionId: token } },
    async verifySession() {},
  }, repository: { resolve: identity => ({ id: identity.subject === 'one' ? user : other, createdAt: '2026-10-05T00:00:00Z' }) } }
  if (runtime === 'nest') {
    const app = await createApi(config, dependencies); await app.listen(0, '127.0.0.1'); t.after(() => app.close()); return app.getUrl()
  }
  const legacy = createSecuredLegacy(config, dependencies), server = legacy.app.listen(0, '127.0.0.1')
  await once(server, 'listening'); t.after(async () => { await legacy.close(); await new Promise(resolve => server.close(resolve)) })
  return `http://127.0.0.1:${server.address().port}`
}
const options = (data = input, token = 'one') => ({ method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(data) })
for (const runtime of ['nest', 'express']) {
  test(`${runtime}: voice requires identity, validates strict input, returns no-store subtitles and hides provider config`, async t => {
    const base = await start(t, runtime, new VoiceService(new FakeVoiceProvider(), parseEnvironment({}).voice))
    const path = base + '/api/voice/utterances'
    assert.equal((await fetch(path, { method: 'POST' })).status, 401)
    assert.equal((await fetch(path, options(input, 'invalid'))).status, 401)
    for (const patch of [{ userId: other }, { voiceId: 'evil' }, { text: 'x'.repeat(1001) }]) assert.equal((await fetch(path, options({ ...input, ...patch }))).status, 400)
    assert.equal((await fetch(path + '?apiKey=secret', options())).status, 400)
    assert.equal((await fetch(path, { ...options(), body: '{' })).status, 400)
    assert.equal((await fetch(path, options({ ...input, text: 'x'.repeat(20000) }))).status, 413)
    const response = await fetch(path, options())
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
    const result = await response.json(); assert.equal(result.status, 'ready'); assert.equal(result.subtitle, input.text)
    assert.equal(JSON.stringify(result).includes('elevenlabs'), false)
    const spec = await (await fetch(base + '/api/openapi.json')).json()
    assert.deepEqual(spec.paths['/api/voice/utterances'].post.security, [{ bearer: [] }])
  })
  test(`${runtime}: robot ownership mutes only its user and the new fallback is documented`, async t => {
    const voice = new VoiceService(new FakeVoiceProvider(), parseEnvironment({}).voice)
    const c = voice.embodiments.forUser(user)
    const lease = c.acquireRobot(c.snapshot().lease.leaseId, other)
    const base = await start(t, runtime, voice)
    const result = await (await fetch(base + '/api/voice/utterances', options())).json()
    assert.deepEqual(result, { schemaVersion: 1, id: input.id, subtitle: input.text, status: 'text_only', reason: 'EMBODIMENT_MUTED' })
    assert.equal((await (await fetch(base + '/api/voice/utterances', options(input, 'two'))).json()).status, 'ready')
    const spec = await (await fetch(base + '/api/openapi.json')).json()
    assert.ok(JSON.stringify(spec.paths['/api/voice/utterances']).includes('EMBODIMENT_MUTED'))
    c.revoke(lease.leaseId)
    assert.equal((await (await fetch(base + '/api/voice/utterances', options())).json()).status, 'ready')
  })
  test(`${runtime}: default disabled returns text only to authenticated users and legacy cannot use voice`, async t => {
    const base = await start(t, runtime)
    const result = await (await fetch(base + '/api/voice/utterances', options())).json()
    assert.equal(result.reason, 'DISABLED'); assert.equal(result.subtitle, input.text)
    const legacy = await start(t, runtime, undefined, { MIMIX_AUTH_MODE: 'legacy' })
    assert.equal((await fetch(legacy + '/api/voice/utterances', options())).status, 404)
  })
  test(`${runtime}: cancellation is scoped to authenticated user and disconnect aborts upstream`, async t => {
    let started, signal
    let ready = new Promise(resolve => { started = resolve })
    const voice = new VoiceService({ synthesize: (_text, options) => { signal = options.signal; started(); return new Promise(() => {}) } }, parseEnvironment({}).voice)
    const base = await start(t, runtime, voice)
    assert.ok((await (await fetch(base + '/api/openapi.json')).json()).paths['/api/voice/utterances'])
    const pending = fetch(base + '/api/voice/utterances', options())
    await ready
    const cancel = token => fetch(base + '/api/voice/utterances/' + input.id, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    assert.equal((await (await cancel('two')).json()).cancelled, false); assert.equal(signal.aborted, false)
    assert.equal((await (await cancel('one')).json()).cancelled, true)
    assert.equal((await (await pending).json()).reason, 'CANCELLED'); assert.equal(signal.aborted, true)
    ready = new Promise(resolve => { started = resolve })
    const disconnected = httpRequest(base + '/api/voice/utterances', { method: 'POST', agent: false, headers: options().headers })
    disconnected.on('error', () => undefined)
    disconnected.end(JSON.stringify(input))
    await ready; disconnected.destroy()
    await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }))
    assert.equal(signal.aborted, true)
  })
}
