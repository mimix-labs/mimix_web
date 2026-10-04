import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { waitForResponse } from './helpers/readiness.js'
import { getPort } from '../../../test/contracts/helpers.js'

async function fixture(t, mode) {
  const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = getPort(probe); await new Promise(resolve => probe.close(resolve))
  const child = fork(new URL('./fixtures/readiness-child.js', import.meta.url), [mode, String(port)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let output = ''; child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited } })
  return { child, url: `http://127.0.0.1:${port}`, output: () => output }
}

test('readiness accepts a healthy child delayed beyond the former 2.5 second budget', { timeout: 20000 }, async t => {
  const f = await fixture(t, 'delayed')
  const response = await waitForResponse(f.child, f.url, { output: f.output })
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), { mode: 'jetson' })
})

test('readiness reports an early exit instead of spending its startup deadline', { timeout: 5000 }, async t => {
  const f = await fixture(t, 'exit')
  await assert.rejects(waitForResponse(f.child, f.url, { output: f.output }), /exited.*23/)
})

test('readiness exposes a non-200 response without treating it as a connection retry', { timeout: 5000 }, async t => {
  const f = await fixture(t, 'bad-response')
  const response = await waitForResponse(f.child, f.url, { output: f.output })
  assert.equal(response.status, 503)
})

test('readiness deadline cancels a server that accepts the connection but never responds', { timeout: 5000 }, async t => {
  const f = await fixture(t, 'hang')
  await once(f.child, 'message') // The fixture is listening before the deadline starts.
  const requested = once(f.child, 'message')
  const rejected = assert.rejects(waitForResponse(f.child, f.url, { timeoutMs: 1000, output: f.output }), /readiness deadline.*1000/)
  assert.equal((await requested)[0].event, 'request-received')
  await rejected
})
