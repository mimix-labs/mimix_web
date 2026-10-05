import assert from 'node:assert/strict'
import test from 'node:test'

import * as module from '../dist/config/environment.js'
test('configuration validates startup inputs without disclosing values', () => {
  assert.equal(typeof module.parseEnvironment, 'function', 'validated configuration is required')
  const config = module.parseEnvironment({})
  assert.equal(config.port, 4000)
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.runtime, 'nest')
  assert.equal(config.visionMode, 'browser')
  for (const env of [
    { PORT: '4000junk' }, { PORT: '0' }, { PORT: '65536' },
    { MIMIX_VISION_MODE: 'unknown' }, { MIMIX_API_RUNTIME: 'both' },
    { MIMIX_VISION_VIDEO_URL: 'https://example.com/secret-value' },
    { LOG_LEVEL: 'invalid' }, { HOST: ' ' },
    { MIMIX_ROBOT_BRIDGE_TOKEN: 'secret-value', MIMIX_ROBOT_CONTROL_TOKEN: 'secret-value' },
  ]) {
    assert.throws(() => module.parseEnvironment(env), error => !error.message.includes('secret-value'))
  }
  assert.equal(module.parseEnvironment({ PORT: '8080', MIMIX_VISION_MODE: ' JETSON ', MIMIX_API_RUNTIME: 'express' }).port, 8080)
})

test('device pairing is opt-in and requires verified users and PostgreSQL', () => {
  assert.equal(module.parseEnvironment({}).deviceSessionsEnabled, false)
  for (const flag of ['true', 'yes', '1']) assert.throws(() => module.parseEnvironment({ MIMIX_DEVICE_SESSIONS_ENABLED: flag }))
  const env = { MIMIX_DEVICE_TOKEN_KEY: 'AQ'.repeat(21) + 'A', MIMIX_DEVICE_SESSIONS_ENABLED: 'true', MIMIX_AUTH_MODE: 'clerk', MIMIX_DATA_STORE: 'postgres', DATABASE_URL: 'postgres://db/mimix', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://example.test' }
  assert.throws(() => module.parseEnvironment({ ...env, MIMIX_DEVICE_TOKEN_KEY: '' }))
  assert.throws(() => module.parseEnvironment({ ...env, MIMIX_DEVICE_TOKEN_KEY: 'x'.repeat(43) }))
  assert.equal(module.parseEnvironment(env).deviceSessionsEnabled, true)
  assert.throws(() => module.parseEnvironment({ ...env, MIMIX_DATA_STORE: 'file', MIMIX_IDENTITY_FILE: '/unused/identity.json' }))
})
