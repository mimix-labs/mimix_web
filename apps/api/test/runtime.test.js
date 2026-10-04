import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { waitForResponse } from './helpers/readiness.js'
import { getPort } from '../../../test/contracts/helpers.js'

for (const runtime of ['nest', 'express']) {
  test(`${runtime} entrypoint respects PORT and exits with active SSE on SIGTERM`, async t => {
    const probe = createServer().listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const port = getPort(probe)
    await new Promise(resolve => probe.close(resolve))
    const child = fork(new URL('../dist/main.js', import.meta.url), {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MIMIX_API_RUNTIME: runtime, LOG_LEVEL: 'silent', MIMIX_VISION_MODE: 'jetson', MIMIX_ROBOT_BRIDGE_TOKEN: '', MIMIX_ROBOT_CONTROL_TOKEN: '' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
    const base = `http://127.0.0.1:${port}`
    const ready = await waitForResponse(child, base + '/api/vision/config', { output: () => output })
    assert.equal(ready.status, 200, output)
    assert.deepEqual(JSON.parse(ready.body), { mode: 'jetson' })
    const abort = new AbortController()
    t.after(() => abort.abort())
    const response = await fetch(base + '/api/robot/commands/stream', { signal: abort.signal })
    const reader = response.body.getReader()
    await reader.read()
    const exited = once(child, 'exit')
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000)
    child.kill('SIGTERM')
    const [code, signal] = await exited
    clearTimeout(timer)
    assert.equal(signal, null, output)
    assert.equal(code, 0, output)
    assert.equal((await reader.read()).done, true)
  })
}

test('invalid configuration stops the actual entrypoint before listening', async () => {
  const child = fork(new URL('../dist/main.js', import.meta.url), {
    env: { ...process.env, PORT: 'secret-invalid-port' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  child.stderr.on('data', data => { output += data })
  const [code] = await once(child, 'exit')
  assert.equal(code, 1)
  assert.match(output, /Invalid configuration: PORT/)
  assert.ok(!output.includes('secret-invalid-port'))
})
