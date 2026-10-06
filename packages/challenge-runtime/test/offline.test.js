import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { openOfflineProgress, synchronizeOfflineSession } from '../dist/offline.js'

test('host keeps exact pending ID after uncertain delivery and resumes before accepting new facts', async t => {
  const events = [], checkpoints = []
  let loseResponse = true
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk
    const body = JSON.parse(text)
    if (req.url.endsWith('/attempts')) return res.end(JSON.stringify({ lastSequence: events.length ? 2 : 1 }))
    assert.equal(req.headers.authorization, 'Local capability')
    assert.deepEqual(checkpoints.at(-1), body.event)
    events.push(body.event)
    if (loseResponse) { loseResponse = false; req.socket.destroy(); return }
    res.end('{}')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  const options = { origin: `http://127.0.0.1:${server.address().port}`, session: { token: 'capability' },
    attempt: { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' },
    savePending: async event => { checkpoints.push(event) } }
  const host = await openOfflineProgress(options)
  await assert.rejects(host.record({ type: 'answer_submitted', payload: { correct: true } }))
  await assert.rejects(host.record({ type: 'hint_requested', payload: {} }), /pending/)
  const restored = await openOfflineProgress({ ...options, pending: checkpoints.at(-1) })
  await restored.retry()
  assert.deepEqual(events[0], events[1])
  await restored.record({ type: 'hint_requested', payload: {} })
  assert.equal(events[2].sequence, 3)
  assert.equal(checkpoints.at(-1), null)
})

test('reconnect runner refreshes token, drains batches, and stops for login or storage failure', async t => {
  let requests = 0, tokens = 0, mode = 'retry'
  const states = []
  const server = createServer((req, res) => {
    requests++
    assert.equal(req.headers['x-mimix-sync-token'], `token-${tokens}`)
    if (mode === 'storage') { res.writeHead(503).end(JSON.stringify({ state: 'storage_unavailable' })); return }
    if (mode === 'login') { res.writeHead(401).end('{}'); return }
    if (requests === 1) { res.writeHead(503).end(JSON.stringify({ state: 'pending' })); return }
    res.end(JSON.stringify({ pendingEvents: requests === 2 ? 1 : 0, state: requests === 2 ? 'pending' : 'synchronized' }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  const options = { origin: `http://127.0.0.1:${server.address().port}`, session: { token: 'capability' },
    getClerkToken: async () => `token-${++tokens}`, retryDelayMs: 1, onState: state => states.push(state) }
  await synchronizeOfflineSession(options)
  assert.equal(requests, 3); assert.equal(states.at(-1), 'synchronized')
  mode = 'login'; await assert.rejects(synchronizeOfflineSession(options)); assert.equal(states.at(-1), 'login_required')
  mode = 'storage'; await assert.rejects(synchronizeOfflineSession(options)); assert.equal(states.at(-1), 'storage_unavailable')
})

test('sync drains uncertain host records before sealing and blocks concurrent new records', async t => {
  let unavailable = true, sealed = false, received = 0
  const order = []
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk
    if (req.url.endsWith('/attempts')) return res.end(JSON.stringify({ lastSequence: 1 }))
    if (req.url.endsWith('/events')) {
      if (unavailable) { req.socket.destroy(); return }
      if (sealed) { res.writeHead(409).end('{}'); return }
      order.push('event'); received++; res.end('{}'); return
    }
    order.push('seal'); sealed = true; res.end(JSON.stringify({ pendingEvents: 0 }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  const options = { origin: `http://127.0.0.1:${server.address().port}`, session: { token: 'same-host-session' },
    attempt: { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' }, savePending: async () => {} }
  const host = await openOfflineProgress(options)
  await assert.rejects(host.record({ type: 'hint_requested', payload: {} }))
  await assert.rejects(synchronizeOfflineSession({ ...options, getClerkToken: async () => 'clerk' }))
  assert.equal(sealed, false)
  unavailable = false
  const sync = synchronizeOfflineSession({ ...options, session: { ...options.session }, getClerkToken: async () => 'clerk' })
  await assert.rejects(host.record({ type: 'hint_requested', payload: {} }))
  await sync
  assert.equal(received, 1); assert.deepEqual(order, ['event', 'seal'])
  await assert.rejects(host.record({ type: 'hint_requested', payload: {} }))
})

test('login failure before sync keeps offline recording usable and a fresh handle replaces aborted transport', async t => {
  let syncCalls = 0
  const server = createServer(async (req, res) => {
    for await (const chunk of req) { void chunk }
    if (req.url.endsWith('/attempts')) return res.end(JSON.stringify({ lastSequence: 1 }))
    if (req.url.endsWith('/sync')) { syncCalls++; return res.end(JSON.stringify({ pendingEvents: 0 })) }
    res.end('{}')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  const controller = new AbortController()
  let checkpoint = null
  const options = { origin: `http://127.0.0.1:${server.address().port}`, session: { token: 'lifecycle-session' },
    attempt: { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' },
    savePending: async pending => { checkpoint = pending } }
  const host = await openOfflineProgress({ ...options, signal: controller.signal })
  await assert.rejects(synchronizeOfflineSession({ ...options, getClerkToken: async () => null }))
  assert.equal(syncCalls, 0)
  await host.record({ type: 'hint_requested', payload: {} })
  controller.abort()
  await assert.rejects(host.record({ type: 'hint_requested', payload: {} }))
  assert.ok(checkpoint)
  const restored = await openOfflineProgress({ ...options, pending: checkpoint })
  await restored.retry()
  await synchronizeOfflineSession({ ...options, getClerkToken: async () => 'clerk' })
  assert.equal(syncCalls, 1)
})
