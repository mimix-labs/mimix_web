import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStore } from '../dist/modules/sync/local-store.js'
import { backupQueue, restoreQueue, checkQueue } from '../dist/modules/sync/maintenance.js'
test('consistent WAL backup restores original capabilities and IDs without replacing a corrupt original', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'mimix-backup-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'queue.sqlite'), copy = join(dir, 'backup.sqlite'), restored = join(dir, 'restored.sqlite')
  const store = new LocalStore(path); t.after(() => store.close())
  const session = store.createSession(), attempt = { attemptId: randomUUID(), startedEventId: randomUUID(), challengeId: 'science', challengeVersion: '1.0.0' }
  store.createAttempt(session.token, attempt)
  await backupQueue(path, copy)
  store.append(session.token, { attemptId: attempt.attemptId, event: { eventId: randomUUID(), sequence: 2, type: 'hint_requested', payload: {} } })
  assert.equal(checkQueue(copy).events, 1)
  await restoreQueue(copy, restored)
  const recovered = new LocalStore(restored); t.after(() => recovered.close())
  assert.equal(recovered.createAttempt(session.token, attempt).duplicate, true)
  assert.equal(recovered.status(session.token).pendingEvents, 1)
  const corrupt = join(dir, 'corrupt.sqlite'); writeFileSync(corrupt, 'preserve me')
  await assert.rejects(restoreQueue(copy, corrupt))
  assert.equal(readFileSync(corrupt, 'utf8'), 'preserve me')
  await assert.rejects(backupQueue(path, copy))
  await assert.rejects(restoreQueue(corrupt, join(dir, 'bad-restored.sqlite')))
})
