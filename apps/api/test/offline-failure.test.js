import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { LocalStore } from '../dist/modules/sync/local-store.js'
import { SyncService } from '../dist/modules/sync/service.js'
import { parseEnvironment } from '../dist/config/environment.js'
import { createApi } from '../dist/app.js'
import { createSecuredLegacy } from '../dist/security/legacy.js'

test('redirects and malformed cloud receipts never acknowledge local records', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'mimix-sync-failure-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new LocalStore(join(dir, 'queue.sqlite')); t.after(() => store.close())
  const session = store.createSession(), userId = randomUUID()
  store.createAttempt(session.token, { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' })
  let mode = 'redirect', targetHits = 0
  const target = createServer((_req, res) => { targetHits++; res.end('{}') })
  target.listen(0, '127.0.0.1'); await once(target, 'listening'); t.after(() => new Promise(resolve => target.close(resolve)))
  const server = createServer((req, res) => {
    if (mode === 'redirect') { res.writeHead(307, { location: `http://127.0.0.1:${target.address().port}` }).end(); return }
    res.end(JSON.stringify(req.url.endsWith('/bind') ? { sessionId: session.sessionId, userId, serverTime: Date.now() } : { invalid: true }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  const service = new SyncService(store, undefined, `http://127.0.0.1:${server.address().port}`)
  await assert.rejects(service.localRequest('sync', `Local ${session.token}`, 'sensitive-token', {}), e => e.status === 503)
  assert.equal(targetHits, 0)
  mode = 'bad-receipt'
  await assert.rejects(service.localRequest('sync', `Local ${session.token}`, 'sensitive-token', {}), e => e.status === 503 && e.state === 'pending')
  assert.equal(store.status(session.token).pendingEvents, 1)
})

for (const runtime of ['nest', 'express']) test(`${runtime}: corrupt queue is explicit 503 while gateway remains healthy`, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'mimix-corrupt-http-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'queue.sqlite'); writeFileSync(path, 'corrupt-original')
  const config = parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_OFFLINE_ENABLED: 'true', MIMIX_OFFLINE_DB_PATH: path })
  let base
  if (runtime === 'nest') {
    const app = await createApi(config); await app.listen(0, '127.0.0.1'); t.after(() => app.close()); base = await app.getUrl()
  } else {
    const app = createSecuredLegacy(config), server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening')
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() }); base = `http://127.0.0.1:${server.address().port}`
  }
  assert.equal((await fetch(base + '/api/health')).status, 200)
  const response = await fetch(base + '/api/offline/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(response.status, 503); assert.equal((await response.json()).state, 'storage_unavailable')
  assert.equal(readFileSync(path, 'utf8'), 'corrupt-original')
  const spec = await (await fetch(base + '/api/openapi.json')).json()
  assert.ok(spec.paths['/api/offline/events']); assert.equal(spec.paths['/api/sync/bind'], undefined)
})

test('offline flags require isolated modes, absolute SQLite and an explicit secure cloud origin', () => {
  for (const env of [
    { MIMIX_OFFLINE_ENABLED: 'yes' }, { MIMIX_SYNC_ENABLED: 'true' },
    { MIMIX_OFFLINE_ENABLED: 'true', MIMIX_OFFLINE_DB_PATH: 'relative.sqlite' },
    { MIMIX_SYNC_CLOUD_ORIGIN: 'http://cloud.test' }, { MIMIX_SYNC_CLOUD_ORIGIN: 'https://cloud.test/path' },
    { MIMIX_SYNC_CLOUD_ORIGIN: 'http://127.0.0.1:1234' },
  ]) assert.throws(() => parseEnvironment(env))
  assert.equal(parseEnvironment({ MIMIX_SYNC_CLOUD_ORIGIN: 'https://cloud.test' }).sync.cloudOrigin, 'https://cloud.test')
})
