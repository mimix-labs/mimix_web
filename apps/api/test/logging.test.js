import assert from 'node:assert/strict'
import test from 'node:test'
import { startFixture } from '../../../test/contracts/helpers.js'

test('request and event logs are JSON and omit credentials, query and payload', async t => {
  const { request, output } = await startFixture(t, { MIMIX_CONTRACT_RUNTIME: 'nest', LOG_LEVEL: 'info', MIMIX_ROBOT_BRIDGE_TOKEN: 'do-not-log-bridge' })
  await request('/api/challenges/events?token=do-not-log-query', { challenge: 'do-not-log-body', type: 'do-not-log-body', payload: { token: 'do-not-log-body' } }, { 'X-Mimix-Robot-Token': 'do-not-log-bridge' })
  await request('/api/robot/context', undefined, { 'X-Mimix-Robot-Token': 'do-not-log-wrong' })
  await new Promise(resolve => setTimeout(resolve, 30))
  const logs = output().trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert.ok(logs.some(log => log.req?.path === '/api/challenges/events'))
  assert.ok(logs.some(log => log.message?.event === 'challenge-event'))
  assert.ok(!output().includes('do-not-log-'), output())
})
