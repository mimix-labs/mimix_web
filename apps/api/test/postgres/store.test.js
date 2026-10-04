import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { existsSync } from 'node:fs'

// Removing transactional ownership/order/immutability must break these DB-visible assertions.
test('PostgreSQL event store preserves identity and serializes owned learning history', async t => {
  assert.ok(existsSync(new URL('../../dist/database/database.js', import.meta.url)), 'PostgreSQL persistence must be implemented')
  const { fixture } = await import('./support.js')
  const f = await fixture(t)
  const { store, identities, database, migrate, importSnapshot, exportSnapshot } = f
  const identity = { provider: 'clerk', issuer: 'https://learning.test', subject: 'alice', sessionId: 's1' }
  const user = { id: randomUUID(), createdAt: '2026-10-04T00:00:00.000Z' }
  const snapshot = { version: 1, users: [user], identities: [{ id: randomUUID(), userId: user.id, provider: identity.provider, issuer: identity.issuer, subject: identity.subject }] }
  await importSnapshot(database, snapshot)
  await importSnapshot(database, snapshot)
  await migrate(database)
  assert.deepEqual(await identities.resolve(identity), user)
  assert.deepEqual(await exportSnapshot(database), snapshot)
  const conflicting = structuredClone(snapshot); conflicting.identities[0].subject = 'other'
  await assert.rejects(importSnapshot(database, conflicting))
  assert.deepEqual(await exportSnapshot(database), snapshot)
  const mapped = await Promise.all(Array.from({ length: 12 }, () => identities.resolve({ ...identity, subject: 'bob' })))
  assert.equal(new Set(mapped.map(u => u.id)).size, 1)
  assert.equal((await database.pool.query('select count(*)::int as n from users')).rows[0].n, 2)

  const input = { idempotencyKey: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' }
  const creations = await Promise.all(Array.from({ length: 12 }, () => store.create(user.id, input)))
  assert.equal(new Set(creations.map(r => r.attempt.id)).size, 1)
  assert.equal(creations.filter(r => !r.duplicate).length, 1)
  const attempt = creations[0].attempt
  await assert.rejects(database.pool.query("INSERT INTO learning_events(attempt_id,event_id,sequence,type,payload) VALUES($1,$2,2,'answer_submitted','{}')", [attempt.id, randomUUID()]))
  const conflict = { status: 409 }
  await assert.rejects(store.create(user.id, { ...input, challengeVersion: '2' }), conflict)
  await assert.rejects(store.get(mapped[0].id, attempt.id), { status: 404 })
  const event = { eventId: randomUUID(), sequence: 2, type: 'answer_submitted', payload: { correct: true } }
  await assert.rejects(store.append(mapped[0].id, attempt.id, event), { status: 404 })
  await assert.rejects(store.append(user.id, attempt.id, { ...event, sequence: 3 }), conflict)
  const duplicates = await Promise.all(Array.from({ length: 12 }, () => store.append(user.id, attempt.id, event)))
  assert.equal(duplicates.filter(r => !r.duplicate).length, 1)
  assert.deepEqual(duplicates[0].event, duplicates[11].event)
  await assert.rejects(store.append(user.id, attempt.id, { ...event, payload: { correct: false } }), conflict)
  const race = await Promise.allSettled(Array.from({ length: 8 }, () => store.append(user.id, attempt.id, { eventId: randomUUID(), sequence: 3, type: 'hint_requested', payload: {} })))
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1)
  assert.ok(race.filter(r => r.status === 'rejected').every(r => r.reason.status === 409))

  // A database fault after event insertion must roll back the entire append.
  await database.pool.query("CREATE FUNCTION reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_projection BEFORE UPDATE ON attempt_progress FOR EACH ROW EXECUTE FUNCTION reject_projection()")
  const end = { eventId: randomUUID(), sequence: 4, type: 'attempt_completed', payload: {} }
  await assert.rejects(store.append(user.id, attempt.id, end))
  assert.equal((await database.pool.query('select count(*)::int as n from learning_events')).rows[0].n, 3)
  await database.pool.query('DROP TRIGGER reject_projection ON attempt_progress; DROP FUNCTION reject_projection()')
  await store.append(user.id, attempt.id, end)
  assert.equal((await store.append(user.id, attempt.id, event)).duplicate, true)
  await assert.rejects(store.append(user.id, attempt.id, { ...end, eventId: randomUUID(), sequence: 5 }), conflict)
  const result = await store.get(user.id, attempt.id)
  assert.deepEqual(result.progress, { attemptId: attempt.id, status: 'completed', lastSequence: 4, answers: 1, correctAnswers: 1, hints: 1 })
  assert.deepEqual((await store.create(user.id, input)).attempt, attempt)
  for (const statement of ['UPDATE learning_events SET type=type', 'DELETE FROM learning_events', 'TRUNCATE learning_events', 'UPDATE attempts SET challenge_id=challenge_id', 'DELETE FROM attempts']) await assert.rejects(database.pool.query(statement))
  await database.pool.query('DELETE FROM attempt_progress')
  await store.rebuild()
  await store.rebuild()
  assert.deepEqual(await store.get(user.id, attempt.id), result)

  const active = await store.create(user.id, { ...input, idempotencyKey: randomUUID() })
  await Promise.all([store.rebuild(), store.append(user.id, active.attempt.id, { eventId: randomUUID(), sequence: 2, type: 'attempt_abandoned', payload: {} }), store.rebuild()])
  assert.equal((await store.get(user.id, active.attempt.id)).progress.status, 'abandoned')
  assert.equal((await store.progress(mapped[0].id)).items.length, 0)
  assert.equal((await store.progress(user.id)).items.length, 2)
  const page = await store.progress(user.id)
  assert.equal((await store.progress(user.id, page.items[0].attempt.id)).items.length, 1)
})
