import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { fixture } from '../../../api/test/postgres/support.js'
import { createApi } from '../../../api/dist/app.js'
import { parseEnvironment } from '../../../api/dist/config/environment.js'
import { IdentityError } from '../../../api/dist/modules/identity/identity.contract.js'
import { createApiClient, ApiError } from '../../src/lib/api.ts'

test('web client reads real Nest/Postgres identity and event projections, paginated and isolated', async t => {
  const f = await fixture(t)
  const config = parseEnvironment({ MIMIX_DATA_STORE: 'postgres', DATABASE_URL: f.url, MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://learning.test', CLERK_AUTHORIZED_PARTIES: 'https://learning.test', LOG_LEVEL: 'silent' })
  const provider = {
    async verifyToken(token) { if (!['alice', 'bob'].includes(token)) throw new IdentityError(401); return { provider: 'clerk', issuer: 'https://learning.test', subject: token, sessionId: 'test' } },
    async verifySession() {},
  }
  const app = await createApi(config, { provider })
  await app.listen(0, '127.0.0.1')
  t.after(() => app.close())
  const origin = await app.getUrl(), alice = createApiClient(origin, 'alice'), bob = createApiClient(origin, 'bob')
  const user = await alice.me()
  assert.notEqual(user.id, (await bob.me()).id)
  for (let n = 0; n < 51; n++) {
    const created = await f.store.create(user.id, { idempotencyKey: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' })
    await f.store.append(user.id, created.attempt.id, { eventId: randomUUID(), sequence: 2, type: 'attempt_completed', payload: {} })
  }
  const first = await alice.progress()
  assert.equal(first.items.length, 50)
  assert.ok(first.items.every(item => item.progress.status === 'completed'))
  assert.ok(first.nextCursor)
  const last = await alice.progress(first.nextCursor)
  assert.equal(last.items.length, 1)
  assert.equal(last.nextCursor, null)
  assert.ok(!first.items.some(item => item.attempt.id === last.items[0].attempt.id))
  assert.deepEqual(await bob.progress(), { items: [], nextCursor: null })
  await assert.rejects(createApiClient(origin, 'revoked').me(), error => error instanceof ApiError && error.status === 401)
})
