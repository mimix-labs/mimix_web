import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import { app } from '../../server/src/index.js'

test('production build serves the frontend, health and challenge routes', async () => {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const routes = [
      ['/', 'text/html', 'id="canvas"'],
      ['/challenges/mathematics/', 'text/html', '<title>'],
      ['/challenges/science/', 'text/html', '<title>'],
    ]

    for (const [route, contentType, marker] of routes) {
      const response = await fetch(`${baseUrl}${route}`)
      assert.equal(response.status, 200, route)
      assert.match(response.headers.get('content-type') ?? '', new RegExp(contentType))
      assert.ok((await response.text()).includes(marker), route)
    }

    const health = await fetch(`${baseUrl}/api/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok', project: 'mimix' })

    const missingApi = await fetch(`${baseUrl}/api/not-found`)
    assert.equal(missingApi.status, 404)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve(undefined))
    })
  }
})
