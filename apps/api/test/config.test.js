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
