import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const composeFile = resolve('infra/docker/compose.yaml')
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const image = process.env.MIMIX_TEST_IMAGE || 'mimix-runtime:edge-test'
const simulator = process.env.MIMIX_TEST_SIMULATOR_IMAGE || 'mimix-simulator:edge-test'
const platform = process.env.MIMIX_TEST_PLATFORM || 'linux/amd64'
const arch = platform.split('/')[1]
const baseEnv = { ...process.env, MIMIX_RUNTIME_IMAGE: image, MIMIX_SIMULATOR_IMAGE: simulator, MIMIX_PLATFORM: platform,
  MIMIX_EDGE_PORT: '0', MIMIX_CLOUD_PORT: '0', MIMIX_ROBOT_BRIDGE_TOKEN: 'edge-test-bridge', MIMIX_ROBOT_CONTROL_TOKEN: 'edge-test-operator' }

function compose(project, ...args) {
  return execFileSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], { env: baseEnv, encoding: 'utf8' }).trim()
}

test('profiles boot cached images with bounded resources and no host hardware', { timeout: 600000 }, async t => {
  const project = `mimix-edge-test-${process.pid}`
  t.after(() => compose(project, '--profile', 'cloud', '--profile', 'simulator', 'down', '--timeout', '5'))
  const config = JSON.parse(compose(project, '--profile', 'simulator', 'config', '--format', 'json'))
  assert.deepEqual(Object.keys(config.services).sort(), ['edge-gateway', 'robot-simulator'])
  assert.deepEqual(Object.keys(JSON.parse(compose(project, '--profile', 'cloud', 'config', '--format', 'json')).services), ['cloud'])
  compose(project, '--profile', 'cloud', '--profile', 'simulator', 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
  const cloudPort = compose(project, 'port', 'cloud', '4000').split(':').at(-1)
  assert.equal((await fetch(`http://127.0.0.1:${cloudPort}/api/health`)).status, 200)
  const id = compose(project, 'ps', '-q', 'edge-gateway')
  const inspected = JSON.parse(docker('inspect', id))[0]
  assert.equal(inspected.HostConfig.Memory, 512 * 1024 * 1024)
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true)
  assert.equal(inspected.HostConfig.Privileged, false)
  assert.deepEqual(inspected.HostConfig.Devices || [], [])
  assert.equal(inspected.HostConfig.NanoCpus, 1000000000)
  assert.equal(inspected.HostConfig.PidsLimit, 128)
  assert.equal(inspected.HostConfig.LogConfig.Config['max-size'], '10m')
  assert.equal(docker('image', 'inspect', '--platform', platform, '--format', '{{.Architecture}}', image), arch)
  assert.equal(docker('exec', id, 'node', '-p', 'process.arch'), arch === 'amd64' ? 'x64' : 'arm64')
  const networks = Object.keys(inspected.NetworkSettings.Networks)
  assert.equal(networks.length, 1)
  assert.equal(docker('network', 'inspect', '--format', '{{.Internal}}', networks[0]), 'false')
  const port = compose(project, 'port', 'edge-gateway', '4000').split(':').at(-1)
  const base = `http://127.0.0.1:${port}`
  assert.equal((await fetch(base + '/api/health')).status, 200)
  for (const path of ['/', '/challenges/science/', '/challenges/mathematics/', '/vendor/draco/draco_decoder.wasm']) {
    assert.equal((await fetch(base + path)).status, 200, path)
  }
  const sim = compose(project, 'ps', '-q', 'robot-simulator')
  assert.match(docker('logs', sim), /"type":"connected"/)
  const oldStarted = inspected.State.StartedAt
  compose(project, '--profile', 'simulator', 'restart')
  assert.notEqual(JSON.parse(docker('inspect', id))[0].State.StartedAt, oldStarted)
  compose(project, '--profile', 'simulator', 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
  // Compose may recreate a multi-platform container during reconciliation.
  const reconciled = compose(project, 'ps', '-q', 'edge-gateway')
  assert.equal(JSON.parse(docker('inspect', reconciled))[0].State.Health.Status, 'healthy')
  const restartedPort = compose(project, 'port', 'edge-gateway', '4000').split(':').at(-1)
  assert.equal((await fetch(`http://127.0.0.1:${restartedPort}/api/health`)).status, 200)
})

test('cached deployment rolls back unhealthy releases and rejects missing images before disruption', { timeout: 600000 }, () => {
  const state = mkdtempSync(join(tmpdir(), 'mimix-edge-release-'))
  const project = `mimix-update-test-${process.pid}`
  const env = { ...baseEnv, MIMIX_EDGE_PROJECT: project, MIMIX_WAIT_TIMEOUT: '90' }
  const run = (...args) => spawnSync('bash', ['infra/docker/edge-release.sh', state, ...args], { env, encoding: 'utf8' })
  const current = () => readFileSync(join(state, 'current'), 'utf8').trim()
  let bad
  let second
  try {
    let result = run('deploy', image)
    assert.equal(result.status, 0, result.stderr)
    const good = current()
    assert.match(good, /(?:^|@)sha256:/)
    assert.equal(docker('image', 'inspect', '--platform', platform, '--format', '{{.Architecture}}', good), arch)
    const originalId = compose(project, 'ps', '-q', 'edge-gateway')
    result = run('deploy', 'mimix-missing:never-pull')
    assert.notEqual(result.status, 0)
    assert.equal(current(), good)
    assert.equal(compose(project, 'ps', '-q', 'edge-gateway'), originalId)
    const healthyContainer = docker('create', '--platform', platform, image)
    try { second = docker('commit', '--change', 'LABEL mimix.test.release=second', healthyContainer) }
    finally { docker('rm', healthyContainer) }
    result = run('deploy', second)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(current(), second)
    assert.equal(run('rollback').status, 0)
    assert.equal(current(), good)
    // Real unhealthy image, not a mocked Docker CLI. No network or build needed.
    const container = docker('create', '--platform', platform, image, 'node', '-e', 'setInterval(() => {}, 1000)')
    try { bad = docker('commit', '--change', 'HEALTHCHECK --interval=1s --start-period=0s --timeout=5s --retries=1 CMD node healthcheck.cjs', container) }
    finally { docker('rm', container) }
    result = run('deploy', bad)
    assert.notEqual(result.status, 0)
    assert.equal(current(), good)
    assert.equal(compose(project, 'ps', '--format', '{{.Health}}', 'edge-gateway'), 'healthy')
    // Real filesystem failure during the EXIT trap must preserve the journal.
    mkdirSync(join(state, 'current.tmp'))
    result = run('deploy', bad)
    assert.notEqual(result.status, 0)
    assert.equal(existsSync(join(state, 'pending')), true, 'failed restore bookkeeping must retain recovery journal')
    assert.equal(current(), good)
    rmSync(join(state, 'current.tmp'), { recursive: true })
    result = run('recover')
    assert.equal(result.status, 0, result.stderr)
    // Interrupted transaction recovery always returns to the known-good ID.
    writeFileSync(join(state, 'pending'), good + '\n')
    assert.notEqual(run('deploy', image).status, 0)
    result = run('recover')
    assert.equal(result.status, 0, result.stderr)
    assert.equal(current(), good)
    assert.equal(run('deploy', image).status, 0)
    assert.equal(current(), good)
  } finally {
    compose(project, '--profile', 'edge', 'down', '--timeout', '5')
    if (bad) docker('image', 'rm', bad)
    if (second) docker('image', 'rm', second)
    rmSync(state, { recursive: true, force: true })
  }
})

// A collision must not stop unrelated host services or leave an unmanaged gateway.
test('occupied robot port survives a failed first deployment', { timeout: 45000 }, async () => {
  const { createServer } = await import('node:http')
  const server = createServer((_req, res) => res.end('existing robot service'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const state = mkdtempSync(join(tmpdir(), 'mimix-edge-collision-'))
  const project = `mimix-collision-test-${process.pid}`
  try {
    const result = spawnSync('bash', ['infra/docker/edge-release.sh', state, 'deploy', image], {
      env: { ...baseEnv, MIMIX_EDGE_PROJECT: project, MIMIX_EDGE_PORT: String(address.port), MIMIX_WAIT_TIMEOUT: '10' }, encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.equal(existsSync(join(state, 'current')), false)
    assert.equal(existsSync(join(state, 'pending')), false)
    assert.equal(await (await fetch(`http://127.0.0.1:${address.port}`)).text(), 'existing robot service')
    assert.equal(compose(project, 'ps', '-a', '-q', 'edge-gateway'), '')
  } finally {
    await new Promise(resolve => server.close(() => resolve()))
    compose(project, '--profile', 'edge', 'down', '--timeout', '5')
    rmSync(state, { recursive: true, force: true })
  }
})

test('concurrent release refuses the held state lock without changing its journal', async () => {
  const { spawn } = await import('node:child_process')
  const state = mkdtempSync(join(tmpdir(), 'mimix-edge-lock-'))
  writeFileSync(join(state, 'current'), 'untouched\n')
  const holder = spawn('flock', [join(state, 'lock'), 'sh', '-c', 'printf ready; read token'])
  try {
    await new Promise((resolve, reject) => {
      holder.once('error', reject)
      holder.stdout.once('data', () => resolve())
    })
    const result = spawnSync('bash', ['infra/docker/edge-release.sh', state, 'deploy', image], { env: baseEnv, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Another release operation is running/)
    assert.equal(readFileSync(join(state, 'current'), 'utf8'), 'untouched\n')
    assert.equal(existsSync(join(state, 'pending')), false)
  } finally {
    const exited = new Promise(resolve => holder.once('exit', () => resolve()))
    holder.stdin.end('done\n')
    await exited
    rmSync(state, { recursive: true, force: true })
  }
})


test('edge cold boot serves API and packaged assets with no network interface', { timeout: 180000 }, () => {
  const project = `mimix-offline-test-${process.pid}`
  const offline = (...args) => compose(project, '-f', resolve('test/edge/offline.compose.yaml'), '--profile', 'edge', ...args)
  try {
    offline('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
    const id = offline('ps', '-q', 'edge-gateway')
    assert.equal(docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', id), 'none')
    docker('exec', id, 'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const base = 'http://127.0.0.1:4000';
      assert.equal((await (await fetch(base + '/api/health')).json()).status, 'ok');
      for (const path of ['/', '/challenges/science/', '/challenges/mathematics/']) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes('<html'));
      }
      const wasm = await fetch(base + '/vendor/draco/draco_decoder.wasm');
      assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0, 4)], [0,97,115,109]);
      await assert.rejects(fetch('https://example.com', {signal: AbortSignal.timeout(1000)}));
    `)
  } finally { offline('down', '--timeout', '5') }
})

test('SQLite queue survives recreation on its volume without a network interface', { timeout: 300000 }, () => {
  const project = `mimix-queue-test-${process.pid}`
  const offline = (...args) => compose(project, '-f', resolve('infra/docker/offline.compose.yaml'), '-f', resolve('test/edge/offline.compose.yaml'), '--profile', 'edge', ...args)
  try {
    offline('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
    let id = offline('ps', '-q', 'edge-gateway')
    assert.equal(docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', id), 'none')
    const handle = docker('exec', id, 'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const post = async (path, body, token) => { const response = await fetch('http://127.0.0.1:4000/api/offline/' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? {authorization: 'Local ' + token} : {}) }, body: JSON.stringify(body) }); assert.ok(response.ok); return response.json(); };
      const session = await post('sessions', {});
      const attempt = { attemptId: crypto.randomUUID(), startedEventId: crypto.randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' };
      await post('attempts', attempt, session.token);
      const event = { eventId: crypto.randomUUID(), sequence: 2, type: 'answer_submitted', payload: { correct: true } };
      await post('events', {attemptId: attempt.attemptId, event}, session.token);
      process.stdout.write(JSON.stringify({ session, attempt, event }));
    `)
    offline('down', '--timeout', '5')
    offline('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
    id = offline('ps', '-q', 'edge-gateway')
    docker('exec', id, 'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const {session,attempt,event} = JSON.parse(process.argv[1]);
      const headers = {'content-type': 'application/json', authorization: 'Local ' + session.token};
      const base = 'http://127.0.0.1:4000/api/offline/';
      const status = await (await fetch(base + 'status', {headers})).json();
      assert.equal(status.pendingEvents, 2); assert.equal(status.state, 'login_required');
      const replay = await fetch(base + 'events', {method:'POST',headers,body:JSON.stringify({attemptId:attempt.attemptId,event})});
      assert.equal(replay.status,200); assert.equal((await replay.json()).duplicate,true);
    `, handle)
    docker('exec', id, 'node', 'apps/api/dist/modules/sync/cli.js', 'backup', '/data/offline/progress.sqlite', '/data/offline/backup.sqlite')
    const checked = JSON.parse(docker('exec', id, 'node', 'apps/api/dist/modules/sync/cli.js', 'check', '/data/offline/backup.sqlite'))
    assert.equal(checked.events, 2)
  } finally { offline('down', '-v', '--timeout', '5') }
})
