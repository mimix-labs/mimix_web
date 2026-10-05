import assert from 'node:assert/strict'
import test from 'node:test'
import * as contract from '../dist/index.js'
const id = '11111111-1111-4111-8111-111111111111'
const lease = { schemaVersion: 1, conversationId: id, leaseId: id, holderId: id, kind: 'web', revision: 1, expiresAt: 15000 }
test('lease validates strict neutral identifiers, finite deadline and revision', () => {
  assert.ok(contract.embodimentLeaseSchema)
  assert.deepEqual(contract.embodimentLeaseSchema.parse(lease), lease)
  for (const patch of [{ kind: 'wall-e' }, { revision: 0 }, { expiresAt: Infinity }, { holderId: '../robot' }, { motor: 2 }]) {
    assert.equal(contract.embodimentLeaseSchema.safeParse({ ...lease, ...patch }).success, false)
  }
})
test('states enforce muted web for robot and no authority after close', () => {
  assert.ok(contract.embodimentStateSchema)
  for (const state of [{ phase: 'virtual', lease, webMuted: false }, { phase: 'robot', lease: { ...lease, kind: 'robot' }, webMuted: true }, { phase: 'closed', lease: null, webMuted: true }]) {
    assert.equal(contract.embodimentStateSchema.safeParse({ schemaVersion: 1, ...state }).success, true)
    assert.equal(contract.embodimentStateSchema.safeParse({ schemaVersion: 1, ...state, webMuted: !state.webMuted }).success, false)
  }
  assert.equal(contract.embodimentStateSchema.safeParse({ schemaVersion: 1, phase: 'robot', lease, webMuted: true }).success, false)
})
