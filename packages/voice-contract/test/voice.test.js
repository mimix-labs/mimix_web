import assert from 'node:assert/strict'
import test from 'node:test'
import * as contract from '../dist/index.js'
const request = { schemaVersion: 1, id: '11111111-1111-4111-8111-111111111111', text: 'Vamos a explorar.' }
test('neutral voice request bounds text and rejects provider, character and identity parameters', () => {
  assert.ok(contract.voiceRequestSchema)
  assert.deepEqual(contract.voiceRequestSchema.parse(request), request)
  for (const patch of [{ schemaVersion: 2 }, { text: '' }, { text: ' ' }, { text: 'x'.repeat(1001) },
    { id: 'bad' }, { voiceId: 'x' }, { apiKey: 'secret' }, { userId: 'other' }, { characterId: 'wall-e' }, { url: 'http://localhost' }]) {
    assert.equal(contract.voiceRequestSchema.safeParse({ ...request, ...patch }).success, false)
  }
})
test('every result preserves subtitles and fallback cannot contain audio', () => {
  assert.ok(contract.voiceResultSchema)
  const base = { schemaVersion: 1, id: request.id, subtitle: request.text }
  assert.equal(contract.voiceResultSchema.safeParse({ ...base, status: 'text_only', reason: 'DISABLED' }).success, true)
  assert.equal(contract.voiceResultSchema.safeParse({ ...base, status: 'ready', audio: { contentType: 'audio/mpeg', base64: 'SUQzAA==' } }).success, true)
  for (const value of [{ ...base, status: 'text_only', reason: 'UNKNOWN' },
    { ...base, status: 'ready', audio: { contentType: 'text/html', base64: 'x' } },
    { ...base, status: 'text_only', reason: 'TIMEOUT', audio: {} },
    { ...base, status: 'ready', audio: { contentType: 'audio/mpeg', base64: 'x'.repeat(1398105) } },
  ]) assert.equal(contract.voiceResultSchema.safeParse(value).success, false)
})
