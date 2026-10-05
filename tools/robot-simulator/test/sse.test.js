import assert from 'node:assert/strict'
import test from 'node:test'
import * as simulator from '../dist/index.js'

test('SSE fragmented CRLF, comments and multiline data preserve named events', () => {
  const parser = new simulator.SseParser()
  assert.deepEqual(parser.push(': keepalive\r\nretry: 1000\r\neve'), [])
  assert.deepEqual(parser.push('nt: robot-motion\r\ndata: {"id":\r'), [])
  assert.deepEqual(parser.push('\ndata: "hello"}\r\n\r\n'), [{ event: 'robot-motion', data: '{"id":\n"hello"}' }])
  assert.deepEqual(parser.push('event: ignored\ndata: incomplete'), [])
})

test('SSE buffers reject oversized unterminated lines and multiline frames', () => {
  assert.throws(() => new simulator.SseParser().push('data: ' + 'x'.repeat(65536)), /SSE limit/)
  assert.throws(() => new simulator.SseParser().push(('data: ' + 'x'.repeat(100) + '\n').repeat(700)), /SSE limit/)
})
