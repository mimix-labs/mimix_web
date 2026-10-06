import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import test from 'node:test'
import { fixture } from './support.js'
import { CloudSyncStore } from '../../dist/modules/sync/cloud-store.js'

const key = () => randomBytes(32).toString('base64url')
const claim = () => ({ sessionId: randomUUID(), claimKey: key() })
const batch = binding => {
  const start = randomUUID()
  return { ...binding, attempt: { attemptId: randomUUID(), startedEventId: start, challengeId: 'science', challengeVersion: '1.0.0' },
    events: [{ eventId: start, sequence: 1, type: 'attempt_started', payload: {} },
      { eventId: randomUUID(), sequence: 2, type: 'answer_submitted', payload: { correct: true } },
      { eventId: randomUUID(), sequence: 3, type: 'attempt_completed', payload: {} }] }
}
async function setup(t) {
  const f = await fixture(t)
  const user = await f.identities.resolve({ provider: 'clerk', issuer: 'https://offline.test', subject: 'alice', sessionId: 'session-a' })
  const other = await f.identities.resolve({ provider: 'clerk', issuer: 'https://offline.test', subject: 'bob', sessionId: 'session-b' })
  return { ...f, sync: new CloudSyncStore(f.database), user: user.id, other: other.id }
}
const conflict = error => error.status === 409

test('sync concurrent retries and lost ACKs import each event and progress exactly once', async t => {
  const f = await setup(t), binding = claim(), input = batch(binding)
  assert.equal((await f.sync.bind(f.user, binding)).userId, f.user)
  const receipts = await Promise.all(Array.from({ length: 8 }, () => f.sync.importBatch(f.user, input)))
  assert.equal(new Set(receipts.map(r => r.cloudAttemptId)).size, 1)
  const result = await f.store.get(f.user, receipts[0].cloudAttemptId)
  assert.equal(result.progress.answers, 1)
  assert.equal(result.progress.correctAnswers, 1)
  assert.equal(result.progress.status, 'completed')
  const rows = await f.database.pool.query('SELECT event_id,sequence FROM learning_events WHERE attempt_id=$1 ORDER BY sequence', [receipts[0].cloudAttemptId])
  assert.deepEqual(rows.rows.map(r => r.event_id), input.events.map(e => e.eventId))
  assert.deepEqual(receipts[0].events, input.events.map(({ eventId, sequence }) => ({ eventId, sequence })))
})

test('sync requires immutable owner and claim possession on every batch', async t => {
  const f = await setup(t), binding = claim(), input = batch(binding)
  await f.sync.bind(f.user, binding)
  await assert.rejects(f.sync.bind(f.other, binding), conflict)
  await assert.rejects(f.sync.bind(f.user, { ...binding, claimKey: key() }), conflict)
  await assert.rejects(f.sync.importBatch(f.other, input), conflict)
  await assert.rejects(f.sync.importBatch(f.user, { ...input, claimKey: key() }), conflict)
  assert.equal((await f.store.progress(f.user)).items.length, 0)
})

test('out-of-order or changed content rolls back the entire batch and never renumbers events', async t => {
  const f = await setup(t), binding = claim(), input = batch(binding)
  await f.sync.bind(f.user, binding)
  await assert.rejects(f.sync.importBatch(f.user, { ...input, events: [input.events[0], input.events[2]] }), conflict)
  assert.equal((await f.store.progress(f.user)).items.length, 0)
  const receipt = await f.sync.importBatch(f.user, { ...input, events: input.events.slice(0, 2) })
  const changed = { ...input.events[1], payload: { correct: false } }
  await assert.rejects(f.sync.importBatch(f.user, { ...input, events: [input.events[2], changed] }), conflict)
  assert.equal((await f.store.get(f.user, receipt.cloudAttemptId)).progress.status, 'active')
  await f.sync.importBatch(f.user, { ...input, events: [input.events[2]] })
  assert.equal((await f.store.get(f.user, receipt.cloudAttemptId)).progress.status, 'completed')
  await assert.rejects(f.sync.importBatch(f.user, { ...input, attempt: { ...input.attempt, challengeVersion: '2.0.0' } }), conflict)
})

test('offline mapping cannot adopt an unrelated online attempt with the same creation key', async t => {
  const f = await setup(t), binding = claim(), input = batch(binding)
  await f.sync.bind(f.user, binding)
  const existing = await f.store.create(f.user, { idempotencyKey: input.attempt.attemptId, challengeId: 'science', challengeVersion: '1.0.0' })
  await assert.rejects(f.sync.importBatch(f.user, input), conflict)
  assert.equal((await f.store.get(f.user, existing.attempt.id)).progress.lastSequence, 1)
})
