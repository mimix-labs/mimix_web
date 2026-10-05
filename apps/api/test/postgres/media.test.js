import { fork } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import test from 'node:test'
import { mediaFixture, status } from './media-support.js'
import * as mediaModule from '../../dist/modules/media/service.js'

test('media participants are bound to a live device and grant exactly the selected track directions', async t => {
  const { service, actor, device, calls, request, database } = await mediaFixture(t)
  const joined = await service.create(actor, request(['robot_camera']))
  assert.equal(joined.status, 'ready')
  assert.equal(joined.session.expiresAt - joined.session.createdAt, 300000)
  assert.ok(joined.connection.expiresAt <= joined.session.leaseExpiresAt)
  assert.deepEqual(joined.connection.permissions, { publish: [], subscribe: true })
  const robot = await service.issueRobot(device.token, joined.session.id)
  assert.deepEqual(robot.connection.permissions, { publish: ['camera'], subscribe: false })
  assert.equal(robot.connection.room, joined.connection.room)
  assert.notEqual(robot.connection.identity, joined.connection.identity)
  assert.equal(calls.filter(c => c.action === 'create').length, 1)
  const stored = await database.pool.query('select row_to_json(m) value from media_sessions m')
  assert.equal(JSON.stringify(stored.rows).includes('opaque-media-test-token'), false)
  assert.equal(JSON.stringify(robot).includes(actor.userId), false)
})

test('media denies other owners, new logins, devices and missing camera/audio grants', async t => {
  const { service, actor, stranger, device, connect, request } = await mediaFixture(t, ['presence:heartbeat', 'camera:webrtc'])
  await assert.rejects(service.create(actor, request(['robot_microphone'])), status(403))
  await assert.rejects(service.create(actor, request(['robot_speaker'])), status(403))
  await assert.rejects(service.create({ ...actor, userId: stranger.id }, request()), status(404))
  await assert.rejects(service.create({ ...actor, identity: { ...actor.identity, sessionId: 'new-login' } }, request(['robot_camera'])), status(403))
  const joined = await service.create(actor, request(['robot_camera'])), other = await connect()
  await assert.rejects(service.issueRobot(other.token, joined.session.id), status(403))
  await assert.rejects(service.issueUser({ ...actor, userId: stranger.id }, joined.session.id), status(404))
  await assert.rejects(service.get(stranger.id, joined.session.id), status(404))
  assert.equal((await service.issueRobot(device.token, joined.session.id)).status, 'ready')
})

test('concurrent identical room requests recover one session without duplicate provisioning', async t => {
  const { service, actor, request, calls } = await mediaFixture(t)
  const results = await Promise.allSettled([service.create(actor, request()), service.create(actor, request())])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2)
  assert.equal(results[0].value.session.id, results[1].value.session.id)
  assert.equal(calls.filter(c => c.action === 'create').length, 1)
})

test('provider degradation retains retryable cleanup, explicit LAN fallback and restart recovery', async t => {
  const { service, actor, devices, provider, config, database, request, calls, failure } = await mediaFixture(t)
  failure.create = true; failure.close = true
  const failed = await service.create(actor, request(['robot_camera']))
  assert.equal(failed.status, 'degraded'); assert.equal(failed.reason, 'PROVIDER_UNAVAILABLE')
  assert.equal(failed.fallback.transport, 'mjpeg'); assert.equal(failed.fallback.authentication, 'operator'); assert.equal(failed.fallback.audio, false)
  assert.equal(JSON.stringify(failed).includes('private-provider'), false)
  await service.sweep()
  assert.equal((await service.get(actor.userId, failed.session.id)).state, 'closing')
  failure.close = false
  const restarted = new mediaModule.MediaService(database, devices, provider, config)
  await restarted.sweep()
  assert.equal((await restarted.get(actor.userId, failed.session.id)).state, 'closed')
  assert.ok(calls.some(c => c.action === 'close'))
})

test('no LAN fallback is disclosed for audio-only failure or without approved MJPEG', async t => {
  const { service, actor, failure, request } = await mediaFixture(t, ['presence:heartbeat', 'camera:webrtc', 'microphone:publish'])
  failure.create = true
  const failed = await service.create(actor, request(['robot_microphone']))
  assert.equal(failed.fallback, null)
  await service.sweep()
  const camera = await service.create(actor, request(['robot_camera']))
  assert.equal(camera.fallback, null)
})

for (const end of ['revoke', 'disconnect', 'presence', 'media-expiry']) {
  test(`${end} closes media and prevents further token issuance`, async t => {
    const { service, actor, device, devices, database, request, calls } = await mediaFixture(t)
    const joined = await service.create(actor, request())
    if (end === 'revoke') await devices.revoke(actor.userId, device.session.id)
    if (end === 'disconnect') await devices.disconnect(device.token, { schemaVersion: 1, sequence: 2 })
    if (end === 'presence') await database.pool.query('update device_sessions set presence_expires_at = 1 where id = $1', [device.session.id])
    if (end === 'media-expiry') await database.pool.query('update media_sessions set expires_at = 1 where id = $1', [joined.session.id])
    await service.sweep()
    const stopped = await service.get(actor.userId, joined.session.id)
    assert.equal(stopped.state, 'closed'); assert.equal(stopped.leaseExpiresAt, 0)
    await assert.rejects(service.issueUser(actor, joined.session.id))
    await assert.rejects(service.issueRobot(device.token, joined.session.id))
    assert.equal(calls.filter(c => c.action === 'token').length, 1)
    assert.equal(calls.filter(c => c.action === 'close').length, 1)
  })
}

test('another login of the same owner may close for recovery; closing remains terminal', async t => {
  const { service, actor, stranger, device, request } = await mediaFixture(t)
  const joined = await service.create(actor, request())
  await assert.rejects(service.close(stranger.id, joined.session.id), status(404))
  const closed = await service.close(actor.userId, joined.session.id)
  assert.equal(closed.state, 'closed')
  await assert.rejects(service.issueRobot(device.token, joined.session.id))
  assert.equal((await service.list(actor.userId)).items.length, 1)
})

test('revocation waits for in-flight mint then cleanup fences every subsequent mint', async t => {
  const { service, actor, device, devices, request, calls, failure } = await mediaFixture(t)
  const joined = await service.create(actor, request())
  let release; failure.gate = new Promise(resolve => { release = resolve }); t.after(() => release())
  const issuing = service.issueRobot(device.token, joined.session.id)
  while (calls.filter(c => c.action === 'token').length < 2) await new Promise(resolve => setTimeout(resolve, 5))
  const revoking = devices.revoke(actor.userId, device.session.id)
  release(); await issuing; await revoking; failure.gate = undefined
  await service.sweep()
  await assert.rejects(service.issueRobot(device.token, joined.session.id), status(401))
  assert.equal((await service.get(actor.userId, joined.session.id)).state, 'closed')
})

test('cleanup failures cannot starve later revoked rooms beyond the batch limit', async t => {
  const { service, database, actor, device, provider, calls } = await mediaFixture(t)
  // Clone independent terminal device rows to exercise a backlog without remote pairing quotas.
  for (let n = 1; n <= 101; n++) {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    await database.pool.query(`insert into device_pairings select (jsonb_populate_record(null::device_pairings, to_jsonb(p) || jsonb_build_object('id', $2::text))).* from device_pairings p where id=$1`, [device.session.pairingId ?? (await database.pool.query('select pairing_id from device_sessions where id=$1', [device.session.id])).rows[0].pairing_id, id])
    await database.pool.query(`insert into device_sessions select (jsonb_populate_record(null::device_sessions, to_jsonb(d) || jsonb_build_object('id', $2::text, 'pairing_id', $2::text, 'device_id', $2::text, 'token_hash', replace($2::text, '-', '') || replace($2::text, '-', ''), 'status', 'revoked'))).* from device_sessions d where id=$1`, [device.session.id, id])
    await database.pool.query(`insert into media_sessions (id, device_session_id, user_id, tracks, state, reason, created_at, expires_at) values ($1,$1,$2,'["robot_camera"]','closing','DEVICE_ENDED',1,2)`, [id, actor.userId])
  }
  provider.closeRoom = async room => { calls.push({ action: 'close', room }); if (!room.endsWith('000000000101')) throw new Error('persistent') }
  await service.sweep(); await service.sweep()
  assert.ok(calls.some(c => c.room?.endsWith('000000000101')))
  assert.equal((await database.pool.query("select state from media_sessions where id='00000000-0000-4000-8000-000000000101'")).rows[0].state, 'closed')
})

test('provider room remains tracked when device lease expires during provisioning', async t => {
  const { service, database, device, actor, provider, request } = await mediaFixture(t)
  await database.pool.query('update device_sessions set presence_expires_at = floor(extract(epoch from clock_timestamp())*1000)+500 where id=$1', [device.session.id])
  provider.createRoom = async () => { await new Promise(resolve => setTimeout(resolve, 650)) }
  await assert.rejects(service.create(actor, request()), status(401))
  const rows = (await database.pool.query('select * from media_sessions')).rows
  assert.equal(rows.length, 1)
  await service.sweep()
  assert.equal((await service.get(actor.userId, rows[0].id)).state, 'closed')
})

test('provisioning intent is committed before provider side effects for crash recovery', async t => {
  const { service, database, actor, provider, request } = await mediaFixture(t)
  provider.createRoom = async room => {
    const stored = await database.pool.query('select id from media_sessions where id=$1', [room.replace('mimix-media-', '')])
    assert.equal(stored.rows.length, 1, 'a separate connection must observe the committed cleanup intent')
  }
  assert.equal((await service.create(actor, request())).status, 'ready')
})

test('identity outage after intent commit is recoverable after restart without widening grants', async t => {
  const { service, database, devices, provider, config, actor, stranger, device, request, verification, calls } = await mediaFixture(t)
  verification.failAt = verification.checks + 2
  await assert.rejects(service.create(actor, request(['robot_camera'])), status(503))
  const [pending] = (await database.pool.query('select * from media_sessions')).rows
  assert.equal(calls.length, 0)
  const restarted = new mediaModule.MediaService(database, devices, provider, config)
  const view = await restarted.get(actor.userId, pending.id)
  assert.equal(view.state, 'provisioning'); assert.equal(view.leaseExpiresAt, 0)
  await assert.rejects(restarted.issueRobot(device.token, pending.id), status(401))
  await assert.rejects(restarted.create({ ...actor, userId: stranger.id }, request(['robot_camera'])), status(404))
  await assert.rejects(restarted.create({ ...actor, identity: { ...actor.identity, sessionId: 'new-login' } }, request(['robot_camera'])), status(403))
  await assert.rejects(restarted.create(actor, request(['robot_camera', 'robot_speaker'])), status(409))
  const recovered = await restarted.create(actor, request(['robot_camera']))
  assert.equal(recovered.status, 'ready'); assert.equal(recovered.session.id, pending.id)
  assert.deepEqual(recovered.connection.permissions, { publish: [], subscribe: true })
  const replay = await restarted.create(actor, request(['robot_camera']))
  assert.equal(replay.session.id, pending.id); assert.equal(replay.connection.room, recovered.connection.room)
  assert.equal(calls.filter(c => c.action === 'create').length, 1)
  assert.equal((await database.pool.query('select count(*)::int n from media_sessions')).rows[0].n, 1)
})

test('crash after remote room creation rolls back activation and retry uses the original room', async t => {
  const { url, database, devices, provider, config, actor, request, calls } = await mediaFixture(t)
  const child = fork(new URL('./media-crash-child.js', import.meta.url), { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  const reached = once(child, 'message', { signal: AbortSignal.timeout(10000) })
  child.send({ url, actor, request: request(), config })
  const [effect] = await reached
  assert.ok(effect.room, effect.error)
  const stopped = once(child, 'exit')
  child.kill('SIGKILL'); await stopped
  const [pending] = (await database.pool.query('select * from media_sessions')).rows
  assert.equal(pending.state, 'provisioning')
  const rooms = new Set([effect.room])
  provider.createRoom = async room => { rooms.add(room) }
  const restarted = new mediaModule.MediaService(database, devices, provider, config)
  const recovered = await restarted.create(actor, request())
  assert.equal(recovered.status, 'ready'); assert.equal(recovered.session.id, pending.id)
  assert.deepEqual([...rooms], [`mimix-media-${pending.id}`])
  assert.equal((await restarted.get(actor.userId, pending.id)).state, 'active')
  await restarted.close(actor.userId, pending.id)
  assert.equal(calls.filter(c => c.action === 'close').length, 1)
})

for (const end of ['revoke', 'close', 'disconnect', 'presence', 'media-expiry']) {
  test(`pending provisioning cannot revive after ${end}`, async t => {
    const { service, database, devices, provider, config, actor, device, request, verification, calls } = await mediaFixture(t)
    verification.failAt = verification.checks + 2
    await assert.rejects(service.create(actor, request()), status(503))
    const [pending] = (await database.pool.query('select * from media_sessions')).rows
    assert.equal(pending.state, 'provisioning')
    if (end === 'revoke') await devices.revoke(actor.userId, device.session.id)
    if (end === 'close') await service.close(actor.userId, pending.id)
    if (end === 'disconnect') await service.disconnect(device.token, pending.id)
    if (end === 'presence') await database.pool.query('update device_sessions set presence_expires_at=1 where id=$1', [device.session.id])
    if (end === 'media-expiry') await database.pool.query('update media_sessions set expires_at=1 where id=$1', [pending.id])
    const restarted = new mediaModule.MediaService(database, devices, provider, config)
    await restarted.sweep()
    assert.equal((await restarted.get(actor.userId, pending.id)).state, 'closed')
    await assert.rejects(restarted.issueUser(actor, pending.id))
    await assert.rejects(restarted.issueRobot(device.token, pending.id))
    assert.equal(calls.filter(c => c.action === 'create' || c.action === 'token').length, 0)
  })
}
