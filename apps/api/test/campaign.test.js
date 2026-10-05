import assert from 'node:assert/strict'
import test from 'node:test'
const definition = { schemaVersion: 1, id: 'intro', version: '1.0.0', title: 'Intro', nodes: [
  { id: 'a', challengeId: 'same', challengeVersion: '1.0.0', prerequisites: [] },
  { id: 'b', challengeId: 'same', challengeVersion: '1.0.0', prerequisites: [] },
  { id: 'c', challengeId: 'same', challengeVersion: '2.0.0', prerequisites: ['a', 'b'] },
] }
const fact = (nodeId, completedAttempts = 0, activeAttemptId = null, attempts = 1) => ({ nodeId, attempts, completedAttempts, activeAttemptId })
async function projector() {
  const mod = await import('../dist/modules/campaigns/projection.js').catch(error => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; return {} })
  assert.equal(typeof mod.projectCampaign, 'function', 'campaign projection implemented')
  return mod.projectCampaign
}
test('AND prerequisites count only completed nodes, never an active or abandoned attempt', async () => {
  const project = await projector()
  const initial = project(definition, [])
  assert.equal(initial.status, 'not_started')
  assert.deepEqual(initial.nodes.map(n => [n.id, n.status, n.canStart, n.blockedBy]), [['a', 'available', true, []], ['b', 'available', true, []], ['c', 'locked', false, ['a', 'b']]])
  const partial = project(definition, [fact('a', 1), fact('b', 0, 'active')])
  assert.equal(partial.status, 'in_progress')
  assert.equal(partial.completedNodes, 1)
  assert.deepEqual(partial.nodes[2].blockedBy, ['b'])
  assert.equal(partial.nodes[1].canStart, false)
  const abandoned = project(definition, [fact('b')])
  assert.equal(abandoned.nodes[1].status, 'available')
  assert.equal(abandoned.nodes[2].canStart, false)
})
test('all required nodes complete campaign; retries do not erase previous success', async () => {
  const project = await projector()
  const unlocked = project(definition, [fact('a', 1), fact('b', 1)])
  assert.equal(unlocked.nodes[2].canStart, true)
  assert.equal(unlocked.status, 'in_progress')
  const complete = project(definition, [fact('a', 1, 'retry', 3), fact('b', 1), fact('c', 1)])
  assert.equal(complete.status, 'completed')
  assert.equal(complete.completedNodes, 3)
  assert.equal(complete.totalNodes, 3)
  assert.equal(complete.nodes[0].status, 'completed')
  assert.equal(complete.nodes[0].canStart, false)
  assert.equal(complete.nodes[0].attempts, 3)
  assert.equal(complete.nodes[1].canStart, true)
})
