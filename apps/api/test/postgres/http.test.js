import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createApi } from '../../dist/app.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { start } from './http-support.js'
import { fixture } from './support.js'

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
