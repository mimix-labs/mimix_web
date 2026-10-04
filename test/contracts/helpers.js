import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'

export async function startFixture(t, env = {}) {
  const child = fork(new URL('./fixture.js', import.meta.url), {
    env: { ...process.env, MIMIX_ROBOT_BRIDGE_TOKEN: '', MIMIX_ROBOT_CONTROL_TOKEN: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    if (child.exitCode !== null) return
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    await exited
    clearTimeout(timer)
  })
  const message = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => { throw new Error(`fixture failed: ${output}`) }),
  ])
  const base = `http://127.0.0.1:${message[0].port}`
  return {
    base,
    output: () => output,
    request: (path, body, headers = {}) => fetch(base + path, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { 'content-type': 'application/json', ...headers },
    }),
  }
}

export async function openStream(t, url, headers = {}) {
  const abort = new AbortController()
  const response = await fetch(url, { headers, signal: abort.signal })
  if (response.status !== 200) throw new Error(`SSE ${response.status}: ${await response.text()}`)
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Not SSE')
  const reader = response.body.getReader()
  t.after(() => abort.abort())
  let buffer = ''
  return {
    close: () => abort.abort(),
    async until(marker) {
      const timer = setTimeout(() => abort.abort(), 3000)
      try {
        while (!buffer.includes(marker)) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error('SSE ended before event')
          buffer += new TextDecoder().decode(chunk.value)
        }
        const result = buffer
        buffer = ''
        return result
      } finally { clearTimeout(timer) }
    },
  }
}

export function getPort(server) {
  const address = server.address()
  assert(address && typeof address === 'object')
  return address.port
}
