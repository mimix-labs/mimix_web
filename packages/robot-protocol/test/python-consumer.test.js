import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseLegacyMotion } from '../dist/index.js'

const source = process.env.MIMIX_ROBOT_CONSUMER_SOURCE
test('optional read-only conformance with actual Python motion consumer (no ROS import)', { skip: source ? false : 'Set MIMIX_ROBOT_CONSUMER_SOURCE to inspected web_bridge_node.py' }, () => {
  const base = { id: 'fixture', action: 'forward', maxDurationMs: 300, expiresAt: 1700000003000 }
  const cases = [base, { ...base, maxDurationMs: 100 }, { ...base, maxDurationMs: 500 }, { ...base, expiresAt: 1700000002999 }, { ...base, id: '' }, { ...base, action: 'pwm' }, { ...base, maxDurationMs: 99 }, { ...base, maxDurationMs: 501 }, { ...base, issuedAt: 'ignored' }, { ...base, action: 'stop' }]
  const child = spawnSync('python3', ['-B', fileURLToPath(new URL('./python-consumer.py', import.meta.url)), source], { input: JSON.stringify(cases), encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  const results = JSON.parse(child.stdout)
  assert.deepEqual(results.map(r => r.accepted), [true, true, true, false, false, false, false, false, true, true])
  assert.deepEqual(results, cases.map(value => {
    try { const c = parseLegacyMotion(value, 1700000003000); return { accepted: true, action: c.action, duration: c.maxDurationMs } } catch { return { accepted: false } }
  }))
})
