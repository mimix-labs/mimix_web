import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { getPort } from './helpers.js'
import { createLegacyApp } from '../../server/src/legacy.js'

test('adapter instances isolate context and drain SSE on shutdown', async t => {
  const first = createLegacyApp()
  const second = createLegacyApp()
  const servers = [first, second].map(legacy => legacy.app.listen(0, '127.0.0.1'))
  await Promise.all(servers.map(server => once(server, 'listening')))
  t.after(() => { first.close(); second.close(); for (const server of servers) { server.closeAllConnections(); server.close() } })
  const [a, b] = servers.map(server => `http://127.0.0.1:${getPort(server)}`)
  await fetch(a + '/api/robot/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'challenge', challenge: 'science' }) })
  assert.equal((await (await fetch(a + '/api/robot/context')).json()).page, 'challenge')
  assert.equal((await (await fetch(b + '/api/robot/context')).json()).page, 'world')
  const response = await fetch(a + '/api/vision/stream')
  const reader = response.body.getReader()
  await reader.read()
  first.close()
  assert.equal((await reader.read()).done, true)
})
