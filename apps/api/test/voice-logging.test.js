import assert from 'node:assert/strict'
import test from 'node:test'
import { fork } from 'node:child_process'
import { once } from 'node:events'
test('voice HTTP logs omit keys, tokens, subtitles, query values and upstream failures', { timeout: 10000 }, async t => {
  const child = fork(new URL('./fixtures/voice-logging-child.js', import.meta.url), { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let logs = ''
  child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  const [{ base }] = await once(child, 'message')
  const options = { method: 'POST', headers: { authorization: 'Bearer do-not-log-token', 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, id: '33333333-3333-4333-8333-333333333333', text: 'do-not-log-subtitle' }) }
  const result = await (await fetch(base + '/api/voice/utterances', options)).json()
  assert.equal(result.reason, 'PROVIDER_UNAVAILABLE')
  assert.equal((await fetch(base + '/api/voice/utterances?key=do-not-log-query', options)).status, 400)
  const exit = once(child, 'exit'); child.send('stop'); assert.equal((await exit)[0], 0)
  assert.ok(logs.includes('/api/voice/utterances'))
  assert.equal(logs.includes('do-not-log-'), false)
})
