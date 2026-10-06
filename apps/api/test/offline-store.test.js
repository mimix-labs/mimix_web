import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { LocalStore } from '../dist/modules/sync/local-store.js'

function fixture(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'mimix-offline-'))
  const path = join(dir, 'progress.sqlite')
  const stores = []
  const open = () => { const store = new LocalStore(path, options); stores.push(store); return store }
  t.after(() => { stores.forEach(store => store.close()); rmSync(dir, { recursive: true, force: true }) })
  return { path, open }
}
const attempt = () => ({ attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' })
const event = (sequence = 2, type = 'answer_submitted') => ({ eventId: randomUUID(), sequence, type, payload: type === 'answer_submitted' ? { correct: true } : {} })
const fails = (status) => error => error.status === status

test('SQLite preserves IDs and progress over reopen; retries do not duplicate records', t => {
  const f = fixture(t), a = attempt(), e = event()
  let store = f.open()
  const session = store.createSession()
  store.createAttempt(session.token, a)
  assert.equal(store.append(session.token, { attemptId: a.attemptId, event: e }).duplicate, false)
  store.close(); store = f.open()
  assert.equal(store.createAttempt(session.token, a).duplicate, true)
  assert.equal(store.append(session.token, { attemptId: a.attemptId, event: e }).duplicate, true)
  assert.equal(store.status(session.token).pendingEvents, 2)
  assert.throws(() => store.append(session.token, { attemptId: a.attemptId, event: { ...e, payload: { correct: false } } }), fails(409))
  assert.throws(() => store.append(session.token, { attemptId: a.attemptId, event: event(4) }), fails(409))
  store.append(session.token, { attemptId: a.attemptId, event: event(3, 'attempt_completed') })
  assert.throws(() => store.append(session.token, { attemptId: a.attemptId, event: event(4) }), fails(409))
})

test('local capability and sealed binding prevent cross-session writes and reassignment', t => {
  const store = fixture(t).open(), a = attempt(), first = store.createSession(), other = store.createSession()
  store.createAttempt(first.token, a)
  assert.throws(() => store.append(other.token, { attemptId: a.attemptId, event: event() }), fails(404))
  assert.throws(() => store.status('invalid'), fails(401))
  const claim = store.seal(first.token)
  assert.equal(claim.sessionId, first.sessionId)
  assert.throws(() => store.createAttempt(first.token, attempt()), fails(409))
  assert.throws(() => store.append(first.token, { attemptId: a.attemptId, event: event() }), fails(409))
  const userId = randomUUID()
  store.bind(first.token, { sessionId: first.sessionId, userId, serverTime: 1000 })
  assert.equal(store.status(first.token).userId, userId)
  assert.throws(() => store.bind(first.token, { sessionId: first.sessionId, userId: randomUUID(), serverTime: 1001 }), fails(409))
})

test('clock jumps do not order events or purge pending data; only exact ACKs retire a batch', t => {
  let now = 9e12
  const store = fixture(t, { now: () => now }).open(), a = attempt(), session = store.createSession()
  store.createAttempt(session.token, a); now = -9e12
  store.append(session.token, { attemptId: a.attemptId, event: event() })
  store.seal(session.token)
  const userId = randomUUID()
  store.bind(session.token, { sessionId: session.sessionId, userId, serverTime: 1000 })
  const batch = store.batch(session.token)
  assert.deepEqual(batch.events.map(e => e.sequence), [1, 2])
  const receipt = { sessionId: session.sessionId, userId, attemptId: a.attemptId, cloudAttemptId: randomUUID(), serverTime: 2000,
    events: batch.events.map(({ eventId, sequence }) => ({ eventId, sequence })) }
  assert.throws(() => store.acknowledge(session.token, batch, { ...receipt, events: receipt.events.slice(1) }), fails(409))
  store.prune(session.token)
  assert.equal(store.status(session.token).pendingEvents, 2)
  store.acknowledge(session.token, batch, receipt)
  assert.equal(store.status(session.token).pendingEvents, 0)
  assert.equal(store.batch(session.token), null)
  assert.equal(store.prune(session.token), 0)
  store.bind(session.token, { sessionId: session.sessionId, userId, serverTime: 31 * 86400000 })
  assert.equal(store.prune(session.token), 2)
  // Tombstone still detects conflicting retries after payload retention expires.
  assert.throws(() => store.createAttempt(session.token, { ...a, challengeVersion: '2.0.0' }), fails(409))
})

test('full queue rejects new records without deleting pending history', t => {
  const store = fixture(t, { maxEvents: 2, maxSessions: 1 }).open(), a = attempt(), session = store.createSession()
  assert.throws(() => store.createSession(), fails(507))
  store.createAttempt(session.token, a)
  store.append(session.token, { attemptId: a.attemptId, event: event() })
  assert.throws(() => store.append(session.token, { attemptId: a.attemptId, event: event(3) }), fails(507))
  assert.equal(store.status(session.token).pendingEvents, 2)
})

test('corrupt SQLite is preserved instead of being replaced with an empty queue', t => {
  const f = fixture(t)
  const corrupt = Buffer.from('not a sqlite database: keep for recovery')
  writeFileSync(f.path, corrupt)
  assert.throws(() => f.open())
  assert.deepEqual(readFileSync(f.path), corrupt)
})

test('changed persisted payload fails closed before cloud submission', async t => {
  const { DatabaseSync } = await import('node:sqlite')
  const f = fixture(t), sessionStore = f.open(), a = attempt(), e = event()
  const session = sessionStore.createSession()
  sessionStore.createAttempt(session.token, a); sessionStore.append(session.token, { attemptId: a.attemptId, event: e })
  sessionStore.seal(session.token); sessionStore.bind(session.token, { sessionId: session.sessionId, userId: randomUUID(), serverTime: 1000 })
  sessionStore.close()
  const raw = new DatabaseSync(f.path)
  raw.prepare('UPDATE events SET content=? WHERE id=?').run(JSON.stringify({ ...e, payload: { correct: false } }), e.eventId)
  raw.close()
  const reopened = f.open()
  assert.throws(() => reopened.batch(session.token), error => error.status === 503 && error.state === 'storage_unavailable')
  assert.equal(reopened.status(session.token).pendingEvents, 2)
})

test('an existing empty or foreign SQLite file is not initialized as a new queue', async t => {
  const { DatabaseSync } = await import('node:sqlite')
  const empty = fixture(t); writeFileSync(empty.path, '')
  assert.throws(() => empty.open())
  assert.equal(readFileSync(empty.path).length, 0)
  const foreign = fixture(t), db = new DatabaseSync(foreign.path)
  db.exec('CREATE TABLE other(value TEXT)'); db.close()
  const original = readFileSync(foreign.path)
  assert.throws(() => foreign.open())
  assert.deepEqual(readFileSync(foreign.path), original)
})

test('missing tables in an existing versioned queue are not silently recreated', async t => {
  const { DatabaseSync } = await import('node:sqlite')
  const f = fixture(t), store = f.open(); store.close()
  const raw = new DatabaseSync(f.path); raw.exec('DROP TABLE events'); raw.close()
  assert.throws(() => f.open())
  const inspect = new DatabaseSync(f.path)
  assert.equal(inspect.prepare("SELECT name FROM sqlite_schema WHERE name='events'").get(), undefined)
  inspect.close()
})
