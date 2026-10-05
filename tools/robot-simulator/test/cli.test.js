import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { startFixture } from '../../../test/contracts/helpers.js'
const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

test('CLI explains scenarios and reads a real context with env-only credentials', async t => {
  const help = await exec(process.execPath, [cli, '--help'])
  assert.match(help.stdout, /MIMIX_SIM_LATENCY_MS/)
  assert.match(help.stdout, /MIMIX_SIM_DROP_AFTER_EVENTS/)
  const api = await startFixture(t, { MIMIX_ROBOT_BRIDGE_TOKEN: 'cli-bridge' })
  const { stdout } = await exec(process.execPath, [cli, 'context'], { env: { ...process.env, MIMIX_WEB_URL: api.base, MIMIX_ROBOT_BRIDGE_TOKEN: 'cli-bridge' } })
  assert.equal(JSON.parse(stdout).page, 'world')
  assert.equal(stdout.includes('cli-bridge'), false)
})

test('CLI invalid configuration and request failures have nonzero exit without secret output', async () => {
  await assert.rejects(exec(process.execPath, [cli, 'context'], { env: { ...process.env, MIMIX_WEB_URL: 'https://user:private-secret@example.com' } }), error => {
    assert.equal(error.code, 1)
    assert.equal(error.stderr.includes('private-secret'), false)
    assert.match(error.stderr, /failed/i)
    return true
  })
})

test('MQTT CLI validates env-only identity and redacts broker failures', async () => {
  const help = await exec(process.execPath, [cli, '--help'])
  assert.match(help.stdout, /mqtt/)
  await assert.rejects(exec(process.execPath, [cli, 'mqtt'], { env: { ...process.env, MIMIX_MQTT_URL: 'mqtts://user:private-secret@example.com', MIMIX_MQTT_PASSWORD: 'private-secret' } }), error => {
    assert.equal(error.code, 1); assert.equal((error.stdout + error.stderr).includes('private-secret'), false); return true
  })
})
