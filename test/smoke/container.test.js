import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const image = process.env.MIMIX_TEST_IMAGE || 'mimix:ci'
for (const runtime of ['nest', 'express']) {
  test(`production container serves frontend/API and shuts down: ${runtime}`, { timeout: 30000 }, async t => {
    const id = docker('run', '--detach', '--publish', '127.0.0.1::48004', '--env', 'PORT=48004', '--env', `MIMIX_API_RUNTIME=${runtime}`, image)
    t.after(() => { docker('rm', '--force', id) })
    const port = docker('port', id, '48004').split(':').at(-1)
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok', project: 'mimix' })
        ready = true
        break
      } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.ok(ready, docker('logs', id))
    for (const [route, marker] of [['/', 'id="canvas"'], ['/challenges/mathematics/', '<title>'], ['/challenges/science/', '<title>']]) {
      const response = await fetch(base + route)
      assert.equal(response.status, 200)
      assert.ok((await response.text()).includes(marker))
    }
    assert.equal((await fetch(base + '/api/not-found')).status, 404)
    for (const [method, path] of [['POST', '/api/not-found'], ['POST', '/api/vision/config'], ['PUT', '/api/robot/context'], ['DELETE', '/api/robot/motion']]) {
      const response = await fetch(base + path, {
        method, headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(1000),
      })
      assert.equal(response.status, 404, `${method} ${path}`)
      await response.text()
    }
    assert.equal(docker('exec', id, 'id', '-u'), '1000')
    if (runtime === 'nest') {
      const spec = await (await fetch(base + '/api/openapi.json')).json()
      assert.ok(spec.paths['/api/robot/motion'])
    }
    const abort = new AbortController()
    t.after(() => abort.abort())
    const stream = await fetch(base + '/api/vision/stream', { signal: abort.signal })
    const reader = stream.body.getReader()
    await reader.read()
    docker('stop', '--time', '5', id)
    assert.equal(docker('inspect', '--format', '{{.State.ExitCode}}', id), '0')
    assert.equal((await reader.read()).done, true)
  })
}

for (const runtime of ['nest', 'express']) {
  test(`production container enforces Clerk policy before legacy handlers: ${runtime}`, { timeout: 30000 }, async t => {
    const id = docker('run', '--detach', '--publish', '127.0.0.1::48004', '--tmpfs', '/data:uid=1000,gid=1000,mode=0700',
      '--env', 'PORT=48004', '--env', `MIMIX_API_RUNTIME=${runtime}`, '--env', 'MIMIX_AUTH_MODE=clerk',
      '--env', 'CLERK_SECRET_KEY=sk_test_placeholder', '--env', 'CLERK_ISSUER=https://test.clerk.accounts.dev',
      '--env', 'CLERK_AUTHORIZED_PARTIES=https://mimix.test', '--env', 'MIMIX_ALLOWED_ORIGINS=https://mimix.test',
      '--env', 'MIMIX_IDENTITY_FILE=/data/users.json', '--env', 'MIMIX_ROBOT_BRIDGE_TOKEN=fixture-bridge', image)
    t.after(() => docker('rm', '--force', id))
    const base = `http://127.0.0.1:${docker('port', id, '48004').split(':').at(-1)}`
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try { assert.equal((await fetch(base + '/api/health')).status, 200); ready = true; break }
      catch { await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.ok(ready, docker('logs', id))
    assert.equal((await fetch(base + '/api/identity/me')).status, 401)
    assert.equal((await fetch(base + '/api/challenges/events', { method: 'POST' })).status, 401)
    assert.equal((await fetch(base + '/api/robot/context', { headers: { 'x-mimix-robot-token': 'fixture-bridge' } })).status, 200)
    const denied = await fetch(base + '/api/health', { headers: { origin: 'https://evil.test' } })
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
    const allowed = await fetch(base + '/api/vision/config', { headers: { origin: 'https://mimix.test' } })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://mimix.test')
    docker('stop', '--time', '5', id)
    assert.equal(docker('inspect', '--format', '{{.State.ExitCode}}', id), '0')
  })
}
