import assert from 'node:assert/strict'
import test from 'node:test'
import { learningRecordSchema } from '@mimix/contracts'
import { eventInput, createInput } from '../dist/modules/learning/contract.js'

const envelope = { eventId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', sequence: 2 }
test('SDK learning records retain the HTTP envelope and strict backend validation', () => {
  for (const record of [
    { type: 'answer_submitted', payload: { correct: false } },
    ...['hint_requested', 'attempt_completed', 'attempt_abandoned'].map(type => ({ type, payload: {} })),
  ]) {
    assert.deepEqual(eventInput.parse({ ...envelope, ...learningRecordSchema.parse(record) }), { ...envelope, eventId: envelope.eventId.toLowerCase(), ...record })
    assert.equal(eventInput.safeParse({ ...envelope, ...record, userId: 'x' }).success, false)
    assert.equal(eventInput.safeParse({ ...envelope, ...record, sequence: 1 }).success, false)
    assert.equal(eventInput.safeParse({ ...envelope, ...record, payload: { score: 20 } }).success, false)
  }
  assert.equal(createInput.safeParse({ idempotencyKey: envelope.eventId, challengeId: 'sdk-minimal', challengeVersion: '1.0.0-beta.1' }).success, true)
})
