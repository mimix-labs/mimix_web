import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { TokenVerifier } from 'livekit-server-sdk'
import * as media from '../dist/modules/media/livekit.js'
import { parseEnvironment } from '../dist/config/environment.js'
const key = 'media-test-key', secret = 'fixture-media-secret-at-least-32-characters'
const room = 'mimix-media-11111111-1111-4111-8111-111111111111', identity = 'robot:11111111-1111-4111-8111-111111111111'
async function api(t, failure = false) {
  const calls = []
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part
    calls.push({ path: req.url, body: JSON.parse(body), authorization: req.headers.authorization })
    res.setHeader('content-type', 'application/json')
    if (failure) { res.statusCode = 503; res.end(JSON.stringify({ code: 'unavailable', msg: secret })); return }
    res.end('{}')
  }).listen(0, '127.0.0.1')
  await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)))
  return { calls, config: { provider: 'livekit', url: `ws://127.0.0.1:${server.address().port}`, apiKey: key, apiSecret: secret, mode: 'cloud', lan: true, timeoutMs: 3000 } }
}
test('LiveKit camera-only JWT is signed, short-lived and denies data, admin, screens and microphone', async t => {
  const { config, calls } = await api(t), provider = new media.LiveKitMediaProvider(config)
  await provider.createRoom(room)
  const deadline = Date.now() + 12000
  const result = await provider.issueToken({ room, identity, permissions: { publish: ['camera'], subscribe: false }, expiresAt: deadline })
  const claims = await new TokenVerifier(key, secret).verify(result.token)
  assert.equal(claims.sub, identity); assert.equal(claims.video.room, room)
  assert.equal(claims.video.roomJoin, true); assert.equal(claims.video.canPublish, true)
  assert.deepEqual(claims.video.canPublishSources, ['camera'])
  for (const field of ['canSubscribe', 'canPublishData', 'canUpdateOwnMetadata', 'roomAdmin', 'roomCreate', 'roomList', 'roomRecord']) assert.equal(claims.video[field], false, field)
  assert.ok(claims.exp * 1000 <= deadline); assert.equal(result.expiresAt, claims.exp * 1000)
  assert.equal(claims.metadata, undefined)
  assert.equal(calls[0].body.maxParticipants, 2); assert.equal(calls[0].body.name, room)
  const user = await provider.issueToken({ room, identity: identity.replace('robot:', 'user:'), permissions: { publish: [], subscribe: true }, expiresAt: Date.now() + 900000 })
  const userClaims = await new TokenVerifier(key, secret).verify(user.token)
  assert.equal(userClaims.video.canPublish, false); assert.equal(userClaims.video.canSubscribe, true)
  assert.ok(userClaims.exp * 1000 <= Date.now() + 30000)
  await assert.rejects(provider.issueToken({ room, identity, permissions: { publish: [], subscribe: true }, expiresAt: Date.now() - 1 }))
})
test('Cloud close explicitly revokes both identities before deleting room, without default clock buffer', async t => {
  const { config, calls } = await api(t), provider = new media.LiveKitMediaProvider(config)
  await provider.closeRoom(room, [identity, identity.replace('robot:', 'user:')])
  assert.equal(calls.filter(c => c.path.endsWith('RemoveParticipant')).length, 2)
  for (const call of calls.filter(c => c.path.endsWith('RemoveParticipant'))) {
    assert.ok(Number(call.body.revokeTokenTs) >= Math.floor(Date.now() / 1000))
    assert.equal(call.body.room, room)
  }
  assert.ok(calls.at(-1).path.endsWith('DeleteRoom'))
})
test('provider failures disclose no endpoint credential or vendor response', async t => {
  const { config } = await api(t, true), provider = new media.LiveKitMediaProvider(config)
  await assert.rejects(provider.createRoom(room), error => { assert.equal(error.message, 'media provider unavailable'); return true })
  await assert.rejects(provider.closeRoom(room, [identity]))
})
test('media is opt-in, requires device authority, private server credentials and explicit transport mode', () => {
  assert.equal(parseEnvironment({}).media.provider, 'disabled')
  for (const env of [{ MIMIX_MEDIA_PROVIDER: 'unknown' }, { MIMIX_MEDIA_PROVIDER: 'livekit' }, { MIMIX_MEDIA_LAN: 'yes' }]) assert.throws(() => parseEnvironment(env))
  const env = { MIMIX_MEDIA_PROVIDER: 'livekit', MIMIX_MEDIA_LAN: 'true', MIMIX_LIVEKIT_MODE: 'self-hosted', MIMIX_DEVICE_SESSIONS_ENABLED: 'true', MIMIX_DEVICE_TOKEN_KEY: 'AQ'.repeat(21) + 'A', MIMIX_AUTH_MODE: 'clerk', MIMIX_DATA_STORE: 'postgres', DATABASE_URL: 'postgres://db/mimix', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://example.test', LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret }
  assert.equal(parseEnvironment(env).media.mode, 'self-hosted')
  for (const change of [{ LIVEKIT_URL: 'ws://public.example.test' }, { LIVEKIT_URL: 'wss://user:pass@example.livekit.cloud' }, { LIVEKIT_API_SECRET: '' }, { MIMIX_DEVICE_SESSIONS_ENABLED: 'false' }, { MIMIX_VISION_VIDEO_URL: 'http://public.example.test/stream' }, { MIMIX_LIVEKIT_MODE: 'invalid' }]) assert.throws(() => parseEnvironment({ ...env, ...change }))
})
