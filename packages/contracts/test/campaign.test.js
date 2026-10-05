import assert from 'node:assert/strict'
import test from 'node:test'
import * as contracts from '../dist/index.js'
const node = (id, prerequisites = []) => ({ id, challengeId: 'mathematics', challengeVersion: '1.0.0', prerequisites })
const definition = { schemaVersion: 1, id: 'intro', version: '1.0.0', title: 'Introducción', nodes: [node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c'])] }
test('campaign contract validates a bounded DAG and exact pinned versions', () => {
  assert.ok(contracts.campaignDefinitionSchema, 'campaign schema exported')
  const schema = contracts.campaignDefinitionSchema
  assert.deepEqual(schema.parse(definition), definition)
  for (const nodes of [[], [node('a'), node('a')], [node('a', ['missing'])], [node('a', ['a'])], [node('a', ['b']), node('b', ['a'])], [node('a'), node('b', ['a', 'a'])], Array.from({ length: 101 }, (_, i) => node(`n${i}`))]) {
    assert.equal(schema.safeParse({ ...definition, nodes }).success, false)
  }
  assert.equal(schema.safeParse({ ...definition, nodes: Array.from({ length: 100 }, (_, i) => node(`n${i}`)) }).success, true)
  for (const patch of [{ id: '.' }, { id: '..' }, { nodes: [node('.')] }, { nodes: [node('..')] }, { version: 'latest' }, { version: '1.0.0+build' }, { title: ' ' }, { schemaVersion: 2 }, { progress: 100 }, { nodes: [{ ...node('a'), challengeVersion: '*' }] }]) assert.equal(schema.safeParse({ ...definition, ...patch }).success, false)
})
test('campaign start and cursors are strict and preserve context ownership', () => {
  assert.ok(contracts.campaignStartSchema, 'start schema exported')
  const key = '550E8400-E29B-41D4-A716-446655440000'
  assert.equal(contracts.campaignStartSchema.parse({ idempotencyKey: key }).idempotencyKey, key.toLowerCase())
  for (const patch of [{ userId: 'other' }, { challengeVersion: '2.0.0' }, { completed: true }]) assert.equal(contracts.campaignStartSchema.safeParse({ idempotencyKey: key, ...patch }).success, false)
  assert.deepEqual(contracts.campaignPageQuerySchema.parse({}), {})
  assert.equal(contracts.campaignPageQuerySchema.safeParse({ afterId: 'intro' }).success, false)
  assert.equal(contracts.campaignPageQuerySchema.safeParse({ afterId: 'intro', afterVersion: '1.0.0' }).success, true)
  assert.equal(contracts.campaignPageQuerySchema.safeParse({ userId: 'other' }).success, false)
})
