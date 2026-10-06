import { openOfflineProgress, synchronizeOfflineSession } from '../../../../packages/challenge-runtime/dist/offline.js'
import { backupQueue, restoreQueue } from '../../dist/modules/sync/maintenance.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'
import { fixture } from './support.js'
const provider = {
  async verifyToken(token) {
    if (!['alice', 'bob', 'revoked'].includes(token)) throw new IdentityError(401)
    return { provider: 'clerk', issuer: 'https://sync.test', subject: token === 'revoked' ? 'alice' : token, sessionId: token }
  },
  async verifySession(identity) { if (identity.sessionId === 'revoked') throw new IdentityError(401) },
}
async function launch(t, runtime, env) {
  const config = parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_ALLOWED_ORIGINS: 'https://allowed.test', ...env })
  if (runtime === 'nest') {
    const app = await createApi(config, { provider }); await app.listen(0, '127.0.0.1'); t.after(() => app.close()); return app.getUrl()
  }
  const app = createSecuredLegacy(config, { provider }), server = app.app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() })
  return `http://127.0.0.1:${server.address().port}`
}
async function request(base, path, body, headers = {}) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
for (const runtime of ['nest', 'express']) {
  test(`${runtime}: local queue survives WAN loss and lost cloud ACK; account switch and revocation cannot import`, async t => {
    const f = await fixture(t)
    const cloud = await launch(t, runtime, { MIMIX_SYNC_ENABLED: 'true', MIMIX_DATA_STORE: 'postgres', DATABASE_URL: f.url,
      MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_sync', CLERK_ISSUER: 'https://sync.test', CLERK_AUTHORIZED_PARTIES: 'https://allowed.test' })
    let disconnected = false, loseAck = false
    const proxy = createServer(async (req, res) => {
      if (disconnected) { res.writeHead(503).end('{}'); return }
      let body = ''; for await (const chunk of req) body += chunk
      const response = await fetch(cloud + req.url, { method: req.method, headers: { authorization: req.headers.authorization, 'content-type': 'application/json' }, body })
      const text = await response.text()
      if (loseAck && req.url === '/api/sync/batch') { loseAck = false; req.socket.destroy(); return }
      res.writeHead(response.status, { 'content-type': 'application/json' }).end(text)
    })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening'); t.after(() => new Promise(resolve => proxy.close(resolve)))
    const dir = mkdtempSync(join(tmpdir(), 'mimix-sync-http-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
    const edge = await launch(t, runtime, { MIMIX_OFFLINE_ENABLED: 'true', MIMIX_OFFLINE_DB_PATH: join(dir, 'queue.sqlite'),
      MIMIX_SYNC_CLOUD_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, MIMIX_SYNC_ALLOW_LOOPBACK: 'true' })
    const session = await request(edge, '/api/offline/sessions', {})
    assert.equal(session.status, 201)
    const local = { authorization: `Local ${session.body.token}` }
    const alice = { ...local, 'x-mimix-sync-token': 'alice' }
    const a = { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' }
    assert.equal((await request(edge, '/api/offline/attempts', a, local)).status, 201)
    let event
    const host = await openOfflineProgress({ origin: edge, session: session.body, attempt: a, savePending: async pending => { if (pending) event = pending } })
    await host.record({ type: 'answer_submitted', payload: { correct: true } })
    await backupQueue(join(dir, 'queue.sqlite'), join(dir, 'before-sync.sqlite'))
    assert.equal((await request(edge, '/api/offline/events', { attemptId: a.attemptId, event }, local)).status, 200)
    assert.equal((await request(edge, '/api/offline/status', undefined)).status, 401)
    assert.equal((await request(edge, '/api/offline/status', undefined, { ...local, origin: 'https://evil.test' })).status, 403)
    assert.equal((await request(edge, '/api/offline/bind', {}, local)).status, 401)
    assert.equal((await request(edge, '/api/offline/bind', {}, alice)).status, 200)
    const bound = (await request(edge, '/api/offline/status', undefined, local)).body
    assert.match(bound.userId, /^[a-f0-9-]{36}$/)
    assert.equal((await request(edge, '/api/offline/bind', {}, { ...local, 'x-mimix-sync-token': 'bob' })).status, 409)
    assert.equal((await request(edge, '/api/offline/sync', {}, { ...local, 'x-mimix-sync-token': 'revoked' })).status, 401)
    assert.equal((await request(edge, '/api/offline/events', { attemptId: a.attemptId, event: { ...event, eventId: randomUUID(), sequence: 3 } }, local)).status, 409)
    disconnected = true
    assert.equal((await request(edge, '/api/offline/sync', {}, alice)).status, 503)
    assert.equal((await request(edge, '/api/offline/status', undefined, local)).body.pendingEvents, 2)
    disconnected = false; loseAck = true
    assert.equal((await request(edge, '/api/offline/sync', {}, alice)).status, 503)
    assert.equal((await request(edge, '/api/offline/status', undefined, local)).body.pendingEvents, 2)
    assert.equal((await request(edge, '/api/offline/sync', {}, alice)).status, 200)
    assert.equal((await request(edge, '/api/offline/status', undefined, local)).body.pendingEvents, 0)
    assert.equal((await request(edge, '/api/offline/sync', {}, { ...local, 'x-mimix-sync-token': 'bob' })).status, 409)
    await restoreQueue(join(dir, 'before-sync.sqlite'), join(dir, 'restored.sqlite'))
    const restoredEdge = await launch(t, runtime, { MIMIX_OFFLINE_ENABLED: 'true', MIMIX_OFFLINE_DB_PATH: join(dir, 'restored.sqlite'),
      MIMIX_SYNC_CLOUD_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, MIMIX_SYNC_ALLOW_LOOPBACK: 'true' })
    await synchronizeOfflineSession({ origin: restoredEdge, session: session.body, getClerkToken: async () => 'alice' })
    assert.equal((await request(restoredEdge, '/api/offline/status', undefined, local)).body.pendingEvents, 0)
    const progress = await request(cloud, '/api/learning/progress', undefined, { authorization: 'Bearer alice' })
    assert.equal(progress.body.items.length, 1)
    assert.equal(progress.body.items[0].progress.answers, 1)
    assert.equal((await request(cloud, '/api/sync/bind', {})).status, 401)
    assert.equal((await request(cloud, '/api/offline/sessions', {})).status, 404)
    assert.equal((await request(edge, '/api/sync/bind', {})).status, 404)
  })
}
