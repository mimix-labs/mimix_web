import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { createApiClient, ApiError } from '../src/lib/api.ts'

const id = '11111111-1111-4111-8111-111111111111'
let origin: string
const requests: { url?: string; token?: string }[] = []
const server = createServer((req, res) => {
  requests.push({ url: req.url, token: req.headers.authorization })
  if (req.headers.authorization === 'Bearer slow') { setTimeout(() => res.end('{}'), 100); return }
  if (req.headers.authorization === 'Bearer unavailable') { res.writeHead(503); res.end(); return }
  if (req.headers.authorization === 'Bearer rate-limit') { res.writeHead(429); res.end(); return }
  if (req.headers.authorization === 'Bearer bad') { res.writeHead(401); res.end('secret upstream text'); return }
  if (req.headers.authorization === 'Bearer malformed') { res.end('{"id":"not-uuid"}'); return }
  if (req.headers.authorization === 'Bearer redirect') { res.writeHead(302, { location: '/leak' }); res.end(); return }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(req.url?.startsWith('/api/learning/progress') ? { items: [], nextCursor: null } : { id, createdAt: '2026-10-05T00:00:00Z' }))
})
before(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw Error('address'); origin = `http://127.0.0.1:${address.port}` })
after(() => server.close())
test('missing session refuses to call backend', async () => {
  const count = requests.length
  await assert.rejects(createApiClient(origin, null).me(), (e: unknown) => e instanceof ApiError && e.status === 401)
  assert.equal(requests.length, count)
})
test('uses current user token on each uncached request', async () => {
  assert.equal((await createApiClient(origin, 'alice').me()).id, id)
  await createApiClient(origin, 'bob').me()
  assert.deepEqual(requests.slice(-2).map(r => r.token), ['Bearer alice', 'Bearer bob'])
})
test('passes validated UUID pagination to the existing endpoint', async () => {
  assert.deepEqual(await createApiClient(origin, 'alice').progress(id), { items: [], nextCursor: null })
  assert.equal(requests.at(-1)?.url, `/api/learning/progress?after=${id}`)
  await assert.rejects(createApiClient(origin, 'alice').progress('../identity/me'), (e: unknown) => e instanceof ApiError && e.status === 400)
})
test('rejects malformed responses, hides upstream bodies and does not follow redirects', async () => {
  for (const [token, status] of [['bad', 401], ['malformed', 502], ['redirect', 502]] as const) {
    await assert.rejects(createApiClient(origin, token).me(), (e: unknown) => e instanceof ApiError && e.status === status && !e.message.includes('secret'))
  }
  assert.ok(!requests.some(r => r.url === '/leak'))
})

test('bounds slow upstream requests and preserves retryable failure categories', async () => {
  await assert.rejects(createApiClient(origin, 'slow', 10).me(), (e: unknown) => e instanceof ApiError && e.status === 503)
  for (const [token, status] of [['unavailable', 503], ['rate-limit', 429]] as const) {
    await assert.rejects(createApiClient(origin, token).me(), (e: unknown) => e instanceof ApiError && e.status === status)
  }
})
