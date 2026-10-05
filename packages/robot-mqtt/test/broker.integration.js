import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import mqtt from 'mqtt'
import { BackendMqttTransport, MqttGateway, mqttOptions } from '../dist/index.js'
import { robotTopic } from '@mimix/robot-protocol'
import { brokerFixture, until, docker } from './broker-fixture.js'
test('real broker: scoped ACK, dedup, expiry, ordering, reconnect and outage stop without replay', { timeout: 30000 }, async t => {
  const sessionId = randomUUID(), other = randomUUID(), deviceId = randomUUID(), leaseId = randomUUID()
  const fixture = await brokerFixture(t, [sessionId, other]), events = [], performed = [], stopped = []
  const backend = new BackendMqttTransport(fixture.config)
  const gateway = new MqttGateway({ ...fixture.config, username: sessionId, sessionId, deviceId, behaviors: ['greet', 'stop'] }, {
    perform(intent, signal) { performed.push({ intent, signal }) }, stop(reason) { stopped.push(reason) },
  })
  t.after(async () => { await gateway.close(); await backend.close() })
  backend.start(event => events.push(event)); gateway.start()
  await until(() => events.some(event => event.kind === 'presence' && event.value.state === 'online'))
  let presence = events.find(event => event.kind === 'presence' && event.value.state === 'online').value
  const envelope = (sequence, extra = {}) => {
    const now = Date.now()
    return { schemaVersion: 1, sessionId, connectionId: presence.connectionId, sequence, leaseExpiresAt: now + 2000,
      intent: { schemaVersion: 1, intentId: randomUUID(), conversationId: randomUUID(), deviceId, leaseId, behavior: 'greet', issuedAt: now, expiresAt: now + 1500, ...extra } }
  }
  const first = envelope(1)
  await backend.publish(first)
  await until(() => events.some(event => event.kind === 'ack' && event.value.intentId === first.intent.intentId))
  assert.equal(performed.length, 1)
  await backend.publish(first); await sleep(70); assert.equal(performed.length, 1)
  assert.ok(events.filter(event => event.kind === 'ack' && event.value.intentId === first.intent.intentId).length >= 2)
  await backend.publish(envelope(3)); await until(() => performed.length === 2)
  await backend.publish(envelope(2)); await until(() => stopped.includes('OUT_OF_ORDER'))
  assert.equal(performed.length, 2)
  const now = Date.now(), expired = envelope(4, { issuedAt: now - 2000, expiresAt: now - 1 })
  await assert.rejects(backend.publish(expired), /unavailable/)
  // ACL: gateway may neither publish intentions nor read another gateway's traffic.
  const intruder = mqtt.connect(fixture.config.url, mqttOptions({ ...fixture.config, username: other }))
  t.after(() => intruder.end(true))
  await new Promise(resolve => intruder.once('connect', resolve))
  intruder.on('error', () => {})
  const leaked = []; intruder.on('message', (...args) => leaked.push(args))
  await new Promise(resolve => intruder.subscribe(robotTopic(sessionId, 'intents'), { qos: 1 }, () => resolve()))
  const denied = await new Promise(resolve => intruder.publish(robotTopic(sessionId, 'intents'), JSON.stringify(envelope(99)), { qos: 1 }, (error, packet) => resolve(error || packet?.reasonCode)))
  assert.ok(denied instanceof Error || denied >= 128)
  await backend.publish(envelope(5)); await until(() => performed.length === 3); assert.equal(leaked.length, 0)
  // No gateway subscribed: PUBACK is still not an application ACK.
  const orphan = { ...envelope(6), sessionId: other }
  await backend.publish(orphan); await sleep(70)
  assert.ok(!events.some(event => event.kind === 'ack' && event.value.intentId === orphan.intent.intentId))
  // Broker crash: local bounded watchdog and disconnection both stop output.
  docker('stop', '-t', '0', fixture.container)
  await until(() => !backend.online && !gateway.online)
  await assert.rejects(backend.publish(envelope(7)))
  assert.ok(performed.at(-1).signal.aborted)
  docker('start', fixture.container)
  await until(() => events.some(event => event.kind === 'presence' && event.value.state === 'online' && event.value.connectionId !== presence.connectionId))
  const count = performed.length
  await sleep(200); assert.equal(performed.length, count)
  const stale = envelope(8)
  await backend.publish(stale); await sleep(70); assert.equal(performed.length, count)
  presence = events.filter(event => event.kind === 'presence' && event.value.state === 'online').at(-1).value
  await backend.publish(envelope(9)); await until(() => performed.length === count + 1)
  await until(() => performed.at(-1).signal.aborted, 2500)
})

test('wire-level expired messages stop locally and retained intentions are forbidden by broker', { timeout: 15000 }, async t => {
  const sessionId = randomUUID(), deviceId = randomUUID(), fixture = await brokerFixture(t, [sessionId]), stopped = [], performed = []
  const client = mqtt.connect(fixture.config.url, mqttOptions(fixture.config)); client.on('error', () => {})
  t.after(() => client.end(true))
  await new Promise(resolve => client.once('connect', resolve))
  await client.subscribeAsync([robotTopic(sessionId, 'presence'), robotTopic(sessionId, 'ack')], { qos: 1 })
  let presence, ack
  client.on('message', (topic, bytes) => { if (topic.endsWith('/presence')) presence = JSON.parse(bytes); else ack = JSON.parse(bytes) })
  const gateway = new MqttGateway({ ...fixture.config, username: sessionId, sessionId, deviceId, behaviors: ['greet', 'stop'] }, { perform(value) { performed.push(value) }, stop(reason) { stopped.push(reason) } })
  t.after(() => gateway.close()); gateway.start(); await until(() => presence?.state === 'online')
  const now = Date.now(), envelope = { schemaVersion: 1, sessionId, connectionId: presence.connectionId, sequence: 1, leaseExpiresAt: now + 1000,
    intent: { schemaVersion: 1, deviceId, conversationId: randomUUID(), leaseId: randomUUID(), intentId: randomUUID(), behavior: 'greet', issuedAt: now - 1000, expiresAt: now - 1 } }
  await client.publishAsync(robotTopic(sessionId, 'intents'), JSON.stringify(envelope), { qos: 1 })
  await until(() => ack?.reason === 'EXPIRED')
  assert.equal(performed.length, 0); assert.ok(stopped.includes('EXPIRED'))
  let disconnected = false; client.on('close', () => { disconnected = true })
  client.publish(robotTopic(sessionId, 'intents'), JSON.stringify(envelope), { qos: 1, retain: true }, () => {})
  await until(() => disconnected)
  assert.equal(performed.length, 0)
})
