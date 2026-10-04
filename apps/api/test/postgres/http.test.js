import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'
import { fixture } from './support.js'

const provider = {
  async verifyToken(token) { if (!['alice', 'bob'].includes(token)) throw new IdentityError(401); return { provider: 'clerk', issuer: 'https://learning.test', subject: token, sessionId: 'test' } },
  async verifySession() {},
}
export async function start(t, runtime, url, extra = {}) {
  const config = parseEnvironment({ MIMIX_DATA_STORE: 'postgres', DATABASE_URL: url, MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://learning.test', CLERK_AUTHORIZED_PARTIES: 'https://learning.test', MIMIX_ALLOWED_ORIGINS: 'https://learning.test', MIMIX_IDENTITY_FILE: '/unused/learning.json', LOG_LEVEL: 'silent', ...extra })
  let base
  if (runtime === 'nest') {
    const app = await createApi(config, { provider }); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); t.after(() => app.close())
  } else {
    const app = createSecuredLegacy(config, { provider }); const server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() })
  }
  return async (path, body, actor = 'alice', method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + path, { method, headers: { ...(actor ? { authorization: `Bearer ${actor}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const raw = await r.text(); return { status: r.status, headers: r.headers, body: raw ? JSON.parse(raw) : undefined }
  }
}
for (const runtime of ['nest', 'express']) test(`${runtime}: owned persisted attempts and progress enforce contracts and privacy`, async t => {
  const f = await fixture(t), request = await start(t, runtime, f.url)
  const input = { idempotencyKey: randomUUID(), challengeId: 'science', challengeVersion: '1' }
  assert.equal((await request('/api/learning/attempts', input, '')).status, 401)
  assert.equal((await request('/api/learning/attempts', input, 'bad')).status, 401)
  const created = await request('/api/learning/attempts', input)
  assert.equal(created.status, 201)
  assert.equal(created.headers.get('cache-control'), 'no-store')
  assert.match(created.body.attempt.userId, /^[a-f0-9-]{36}$/)
  assert.equal((await request('/api/learning/attempts', input)).status, 200)
  assert.equal((await request('/api/learning/attempts', { ...input, challengeId: 'math' })).status, 409)
  for (const invalid of [{ ...input, userId: randomUUID() }, { ...input, challengeId: 'secret free text' }, { ...input, idempotencyKey: 'bad' }]) assert.equal((await request('/api/learning/attempts', invalid)).status, 400)
  const id = created.body.attempt.id, path = `/api/learning/attempts/${id}`
  assert.equal((await request(path, undefined, 'bob')).status, 404)
  assert.equal((await request(`/api/learning/attempts/${randomUUID()}`, undefined, 'bob')).status, 404)
  const event = { eventId: randomUUID(), sequence: 2, type: 'answer_submitted', payload: { correct: true } }
  assert.equal((await request(path + '/events', event, 'bob')).status, 404)
  for (const invalid of [{ ...event, sequence: 0 }, { ...event, type: 'attempt_started' }, { ...event, payload: { correct: true, answer: 'private' } }, { ...event, payload: { correct: 'yes' } }, { ...event, occurredAt: 'yesterday' }]) assert.equal((await request(path + '/events', invalid)).status, 400)
  assert.equal((await request(path + '/events', { ...event, sequence: 3 })).status, 409)
  const appended = await request(path + '/events', event); assert.equal(appended.status, 201)
  assert.deepEqual((await request(path + '/events', event)).body.event, appended.body.event)
  assert.equal((await request(path + '/events', { eventId: randomUUID(), sequence: 3, type: 'attempt_completed', payload: {} })).status, 201)
  assert.equal((await request(path + '/events', event)).status, 200)
  assert.equal((await request(path)).body.progress.status, 'completed')
  assert.equal((await request('/api/learning/progress', undefined, 'bob')).body.items.length, 0)
  assert.equal((await request('/api/learning/progress')).body.items.length, 1)
  assert.equal((await request('/api/learning/progress?userId=bob')).status, 400)
  assert.equal((await request('/api/learning/progress?after=bad')).status, 400)
  const doc = await request('/api/openapi.json')
  assert.ok(doc.body.paths['/api/learning/attempts/{id}/events'].post.responses['409'])
})

for (const runtime of ['nest', 'express']) test(`${runtime}: dynamic attempt IDs share quota and DB failure fails closed`, async t => {
  const f = await fixture(t), request = await start(t, runtime, f.url, { MIMIX_RATE_LIMIT_USER: '2' })
  for (let i = 0; i < 2; i++) assert.equal((await request(`/api/learning/attempts/${randomUUID()}`)).status, 404)
  assert.equal((await request(`/API/learning/attempts/${randomUUID()}/?random=1`)).status, 429)
  assert.equal((await request('/api/learning/progress')).status, 200)
  await f.database.pool.query('ALTER TABLE users RENAME TO users_unavailable')
  const unavailable = await request('/api/learning/progress', undefined, 'bob')
  assert.equal(unavailable.status, 503)
  assert.equal(JSON.stringify(unavailable.body).includes('postgres'), false)
})

test('postgres feature flag rejects unsafe configuration and stays disabled by default', async t => {
  assert.throws(() => parseEnvironment({ MIMIX_DATA_STORE: 'postgres' }), /MIMIX_AUTH_MODE/)
  assert.throws(() => parseEnvironment({ MIMIX_DATA_STORE: 'unknown' }), /MIMIX_DATA_STORE/)
  const app = await createApi(parseEnvironment({ LOG_LEVEL: 'silent' })); t.after(() => app.close()); await app.listen(0, '127.0.0.1')
  assert.equal((await fetch((await app.getUrl()) + '/api/learning/progress')).status, 404)
})
