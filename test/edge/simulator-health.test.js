import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

const image = process.env.MIMIX_TEST_IMAGE || 'mimix-runtime:edge-test'
const simulator = process.env.MIMIX_TEST_SIMULATOR_IMAGE || 'mimix-simulator:edge-test'
const platform = process.env.MIMIX_TEST_PLATFORM || 'linux/amd64'
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
async function until(check) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (check()) return
    await delay(250)
  }
  assert.fail('Simulator did not reach the expected connection state')
}

for (const scenario of ['missing', 'incorrect', 'connected']) {
  test(`simulator health reports its live motion receiver: ${scenario} credential`, { timeout: 180000 }, async t => {
    const project = `mimix-sim-health-${scenario}-${process.pid}`
    const token = scenario === 'missing' ? '' : 'health-bridge-secret'
    const env = { ...process.env, MIMIX_RUNTIME_IMAGE: image, MIMIX_PLATFORM: platform,
      MIMIX_EDGE_PORT: '0', MIMIX_ROBOT_BRIDGE_TOKEN: token, MIMIX_ROBOT_CONTROL_TOKEN: 'health-operator-secret' }
    const compose = (...args) => execFileSync('docker', ['compose', '-p', project, '-f', resolve('infra/docker/compose.yaml'), '--profile', 'edge', ...args], { env, encoding: 'utf8' }).trim()
    let receiver
    t.after(() => {
      if (receiver) docker('rm', '-f', receiver)
      compose('down', '--timeout', '5')
    })
    compose('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
    const gateway = compose('ps', '-q', 'edge-gateway')
    receiver = docker('run', '-d', '--pull', 'never', '--platform', platform,
      '--network', `container:${gateway}`, '--read-only', '--tmpfs', '/tmp:size=32m,mode=1777',
      '-e', 'MIMIX_WEB_URL=http://127.0.0.1:4000',
      '-e', `MIMIX_ROBOT_BRIDGE_TOKEN=${scenario === 'incorrect' ? 'wrong-secret' : token}`,
      simulator)
    const probe = () => spawnSync('docker', ['exec', receiver, 'node', 'healthcheck.cjs', 'simulator'], { encoding: 'utf8', timeout: 15000 }).status
    if (scenario !== 'connected') {
      await until(() => docker('inspect', '--format', '{{.State.Running}}', receiver) === 'false' || docker('logs', receiver).includes('"type":"retrying"'))
      assert.notEqual(probe(), 0, 'missing or rejected bridge credentials cannot report healthy')
      assert.doesNotMatch(docker('logs', receiver), /"type":"connected"/)
      return
    }
    await until(() => docker('logs', receiver).includes('"type":"connected"'))
    assert.equal(probe(), 0)
    // The gateway remains reachable, but a stalled receiver must not be healthy.
    // Signal PID 1 from the daemon's ancestor namespace; an in-container kill
    // cannot stop namespace init even when it returns success.
    docker('kill', '--signal', 'STOP', receiver)
    try { assert.notEqual(probe(), 0, 'health must query the receiver process, not a separate context request') }
    finally { docker('kill', '--signal', 'CONT', receiver) }
    await until(() => probe() === 0)
    compose('stop', 'edge-gateway')
    await until(() => docker('logs', receiver).includes('"type":"retrying"'))
    assert.notEqual(probe(), 0, 'disconnected motion stream cannot report healthy')
  })
}
