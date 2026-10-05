import assert from 'node:assert/strict'
import test from 'node:test'
import { fixture } from './support.js'
import { start } from './media-http-support.js'
const env = { MIMIX_MEDIA_PROVIDER: 'livekit', LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'fixture', LIVEKIT_API_SECRET: 'x'.repeat(32) }
for (const runtime of ['nest', 'express']) {
  test(`${runtime}: media HTTP enforces owner, role, origin, strict input and terminal close`, async t => {
    const { url } = await fixture(t)
    const calls = []
    const mediaProvider = { async createRoom() {}, async closeRoom() {}, async issueToken(join) { calls.push(join); return { token: 'opaque', expiresAt: join.expiresAt } } }
    const { request, pair } = await start(t, runtime, url, true, env, mediaProvider)
    const device = await pair(), authorization = `Device ${device.token}`
    await request('/api/devices/heartbeat', { authorization, body: { schemaVersion: 1, sequence: 1 } })
    const body = { schemaVersion: 1, deviceSessionId: device.session.id, tracks: ['robot_camera', 'robot_microphone', 'robot_speaker'] }
    assert.equal((await request('/api/media/sessions', { body, authorization })).status, 401)
    assert.equal((await request('/api/media/sessions', { body: { ...body, room: 'chosen' } })).status, 400)
    const created = await request('/API/MEDIA/SESSIONS/', { body })
    assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'no-store')
    const path = `/api/media/sessions/${created.body.session.id}`, version = { schemaVersion: 1 }
    assert.equal((await request(path, { authorization: 'Bearer bob' })).status, 404)
    assert.equal((await request(`${path}/user-token`, { body: version, authorization: 'Bearer alice-new' })).status, 403)
    assert.equal((await request(`${path}/device-token`, { body: version })).status, 401)
    assert.equal((await request(`${path}/device-token`, { body: { ...version, role: 'user' }, authorization })).status, 400)
    assert.equal((await request(`${path}/device-token`, { body: version, authorization, headers: { origin: 'https://evil.test' } })).status, 403)
    assert.equal((await request(`${path}/device-token`, { body: version, authorization })).status, 200)
    assert.deepEqual(calls[1].permissions, { publish: ['camera', 'microphone'], subscribe: true })
    assert.equal((await request('/api/media/sessions?after=bad')).status, 400)
    assert.equal((await request('/api/media/sessions')).body.items.length, 1)
    const docs = (await request('/api/openapi.json')).body
    assert.deepEqual(docs.paths['/api/media/sessions/{id}/device-token'].post.security, [{ DeviceToken: [] }])
    assert.equal((await request(path, { method: 'DELETE', authorization: 'Bearer alice-new' })).body.state, 'closed')
    assert.equal((await request(`${path}/device-token`, { body: version, authorization })).status, 401)
  })
  test(`${runtime}: media feature off hides HTTP and OpenAPI`, async t => {
    const { url } = await fixture(t), { request } = await start(t, runtime, url)
    assert.equal((await request('/api/media/sessions')).status, 404)
    assert.equal((await request('/api/openapi.json')).body.paths['/api/media/sessions'], undefined)
  })
}
