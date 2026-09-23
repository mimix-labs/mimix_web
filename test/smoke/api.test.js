import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import { app } from '../../server/src/index.js'

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve(undefined))
    })
  }
}

test('API health reports the current service', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok', project: 'mimix' })
  })
})

test('critical API routes expose safe defaults', async () => {
  await withServer(async (baseUrl) => {
    const vision = await fetch(`${baseUrl}/api/vision/config`)
    const robot = await fetch(`${baseUrl}/api/robot/status`)

    assert.equal(vision.status, 200)
    assert.deepEqual(await vision.json(), { mode: 'browser' })
    assert.equal(robot.status, 200)
    assert.equal((await robot.json()).remoteControlEnabled, false)
  })
})

test('challenge events reject incomplete payloads', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/challenges/events`, {
      body: JSON.stringify({ challenge: 'mathematics' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'challenge and type are required' })
  })
})
