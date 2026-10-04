import assert from 'node:assert/strict'
import test from 'node:test'

import * as module from '../dist/app.js'
import * as config from '../dist/config/environment.js'
test('Nest exposes health, OpenAPI, adapted routes and sanitized JSON errors', async t => {
  assert.equal(typeof module.createApi, 'function', 'Nest bootstrap is required')
  const app = await module.createApi(config.parseEnvironment({ LOG_LEVEL: 'silent' }))
  t.after(() => app.close())
  await app.listen(0, '127.0.0.1')
  const base = await app.getUrl()
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok', project: 'mimix' })
  assert.deepEqual(await (await fetch(base + '/api/vision/config')).json(), { mode: 'browser' })
  const doc = await (await fetch(base + '/api/openapi.json')).json()
  assert.equal(doc.info.title, 'Mimix API')
  for (const route of ['/api/health', '/api/robot/motion', '/api/vision/stream', '/api/challenges/events']) assert.ok(doc.paths[route], route)
  assert.equal(doc.paths['/api/robot/motion'].post.responses['202'].description, 'Accepted')
  const missing = await fetch(base + '/api/not-found')
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'not found' })
  const bad = await fetch(base + '/api/challenges/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{secret-value' })
  assert.equal(bad.status, 400)
  assert.deepEqual(await bad.json(), { error: 'invalid JSON body' })
  const large = await fetch(base + '/api/challenges/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(110000) }) })
  assert.equal(large.status, 413)
})

test('application close drains an active legacy SSE connection', async t => {
  const app = await module.createApi(config.parseEnvironment({ LOG_LEVEL: 'silent' }))
  await app.listen(0, '127.0.0.1')
  const abort = new AbortController()
  t.after(() => abort.abort())
  const response = await fetch((await app.getUrl()) + '/api/vision/stream', { signal: abort.signal })
  const reader = response.body.getReader()
  await reader.read()
  const timer = setTimeout(() => abort.abort(), 2000)
  try {
    await app.close()
    assert.equal((await reader.read()).done, true)
    assert.equal(abort.signal.aborted, false, 'shutdown must not wait for the client to disconnect')
  } finally { clearTimeout(timer) }
})


test('unexpected exceptions are generic and do not expose internals', async t => {
  const app = await module.createApi(config.parseEnvironment({ LOG_LEVEL: 'silent' }))
  app.getHttpAdapter().get('/api/test-error', () => { throw new Error('private-internal-value') })
  t.after(() => app.close())
  await app.listen(0, '127.0.0.1')
  const response = await fetch((await app.getUrl()) + '/api/test-error')
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'internal server error' })
})

test('application close drains an active MJPEG response without client abort', async t => {
  const { createServer } = await import('node:http')
  const { once } = await import('node:events')
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
    res.write('--frame\r\nimage\r\n')
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const app = await module.createApi(config.parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_VISION_VIDEO_URL: `http://127.0.0.1:${upstream.address().port}/video` }))
  await app.listen(0, '127.0.0.1')
  const abort = new AbortController()
  t.after(() => { abort.abort(); upstream.closeAllConnections(); upstream.close() })
  const response = await fetch((await app.getUrl()) + '/api/vision/video', { signal: abort.signal })
  const reader = response.body.getReader()
  await reader.read()
  const closing = app.close()
  let timer
  try {
    const closed = await Promise.race([closing.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 500) })])
    assert.equal(closed, true, 'shutdown should end the downstream MJPEG response')
    assert.equal((await reader.read()).done, true)
  } finally {
    clearTimeout(timer)
    abort.abort()
    await closing
  }
})
