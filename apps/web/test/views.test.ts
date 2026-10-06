import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProgressList } from '../src/components/progress-list'
import { ApiState } from '../src/components/api-state'
import { ApiError } from '../src/lib/api'
const id = '11111111-1111-4111-8111-111111111111'
test('progress renders server counters and cursor without inventing completions', () => {
  const html = renderToStaticMarkup(createElement(ProgressList, { page: { items: [{ attempt: { id, challengeId: 'science', challengeVersion: '1.0.0', createdAt: '2026-10-05T00:00:00Z' }, progress: { attemptId: id, status: 'active', lastSequence: 3, answers: 2, correctAnswers: 1, hints: 0 } }], nextCursor: id } }))
  assert.match(html, /En curso/)
  assert.match(html, /1 de 2/)
  assert.ok(html.includes(`/progreso?after=${id}`))
  assert.ok(!html.includes('Completado'))
  const empty = renderToStaticMarkup(createElement(ProgressList, { page: { items: [], nextCursor: null } }))
  assert.match(empty, /role="status"/)
  assert.ok(!empty.includes('Ver más'))
})
test('API failure views offer safe recovery without exposing internal errors', () => {
  for (const status of [400, 401, 404, 429, 502, 503]) {
    const html = renderToStaticMarkup(createElement(ApiState, { error: new ApiError(status), retry: '/progreso' }))
    assert.match(html, /role="status"/)
    assert.ok(html.includes(status === 401 ? 'href="/acceso"' : 'href="/progreso"'))
    assert.ok(!html.includes('Mimix API request failed'))
  }
})
