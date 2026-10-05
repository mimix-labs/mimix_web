import test from 'node:test'
import assert from 'node:assert/strict'
import { mqttOptions } from '../dist/index.js'
test('private TLS config, no URL secrets or remote cleartext escape', () => {
  const base = { url: 'mqtts://broker.example:8883', username: 'backend', password: 'test-password' }
  const options = mqttOptions(base)
  assert.equal(options.protocolVersion, 5)
  assert.equal(options.reconnectPeriod, 0)
  assert.equal(options.clean, true)
  assert.equal(options.properties.sessionExpiryInterval, 0)
  assert.equal(options.queueQoSZero, false)
  assert.equal(options.rejectUnauthorized, true)
  for (const url of ['mqtt://remote.example', 'ws://localhost', 'mqtts://user:secret@broker.example', 'mqtts://broker.example/path', 'mqtts://broker.example?x=1']) {
    assert.throws(() => mqttOptions({ ...base, url, allowLoopback: true }), /Invalid MQTT configuration/)
  }
  assert.throws(() => mqttOptions({ ...base, url: 'mqtt://127.0.0.1' }))
  assert.doesNotThrow(() => mqttOptions({ ...base, url: 'mqtt://127.0.0.1', allowLoopback: true }))
  assert.throws(() => mqttOptions({ ...base, password: '' }))
})
