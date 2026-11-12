import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { forwardActivityRequest } from '../src/lib/activity-api'

test('activity relay preserves the configured backend, query, response stream and POST body', async () => {
  const seen: { url?: string; body: string }[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    seen.push({ url: req.url, body })
    res.writeHead(200, { 'Content-Type': req.url?.includes('stream') ? 'text/event-stream' : 'application/json' })
    res.end(req.url?.includes('stream') ? 'event: robot-command\ndata: {}\n\n' : '{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const origin = `http://127.0.0.1:${address.port}`
  try {
    const stream = await forwardActivityRequest(new Request('http://mimix.test/api/robot/commands/stream?after=2'), origin)
    assert.equal(stream.headers.get('content-type'), 'text/event-stream')
    assert.equal(await stream.text(), 'event: robot-command\ndata: {}\n\n')
    const result = await forwardActivityRequest(new Request('http://mimix.test/api/robot/context', { method: 'POST', body: '{"challenge":"mathematics"}' }), origin)
    assert.equal(await result.text(), '{}')
    assert.deepEqual(seen, [{ url: '/api/robot/commands/stream?after=2', body: '' }, { url: '/api/robot/context', body: '{"challenge":"mathematics"}' }])
    assert.equal((await forwardActivityRequest(new Request('http://mimix.test/api/private/users'), origin)).status, 404)
    assert.equal((await forwardActivityRequest(new Request('http://mimix.test/api/robot/context', { method: 'DELETE' }), origin)).status, 405)
    assert.equal(seen.length, 2)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
