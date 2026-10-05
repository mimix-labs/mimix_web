import assert from 'node:assert/strict'
import test from 'node:test'
import * as policy from '../dist/policy.js'
const contracts = await import('../../contracts/dist/index.js')
const manifest = { capabilities: { required: ['progress'], optional: ['agent', 'camera'] } }
test('grants are explicit, declared and implemented; required capabilities fail closed', () => {
  assert.equal(typeof policy.resolveGrants, 'function')
  assert.deepEqual(policy.resolveGrants(manifest, ['progress','agent','camera'], ['progress','agent']), ['progress','agent'])
  assert.throws(() => policy.resolveGrants(manifest, ['embodiment'], ['embodiment']), { code: 'INVALID_INPUT' })
  assert.throws(() => policy.resolveGrants(manifest, [], ['progress']), { code: 'CAPABILITY_DENIED' })
  assert.throws(() => policy.resolveGrants(manifest, ['progress'], []), { code: 'CAPABILITY_UNAVAILABLE' })
  assert.throws(() => policy.resolveGrants(manifest, ['progress','progress'], ['progress']), { code: 'INVALID_INPUT' })
})
test('bundle boundary rejects HTML breakout and unbounded artifacts', () => {
  assert.equal(typeof policy.validateBundle, 'function')
  assert.doesNotThrow(() => policy.validateBundle('var MimixChallenge = {}'))
  for (const input of ['', '<script>x</script>', '"</ScRiPt>"', 'x'.repeat(524289)]) assert.throws(() => policy.validateBundle(input), { code: 'INVALID_INPUT' })
})
test('typed protocol rejects incompatible, unknown and forged operation payloads', () => {
  assert.ok(contracts.childMessageSchema)
  const message = { v: 1, session: 'a'.repeat(32), kind: 'call', id: 1, method: 'progress.record', input: { type: 'answer_submitted', payload: { correct: true } } }
  assert.equal(contracts.childMessageSchema.safeParse(message).success, true)
  for (const patch of [{v:2},{session:'x'},{id:0},{token:'secret'},{method:'motors.move'},{input:{type:'answer_submitted',payload:{correct:true,userId:'x'}}}]) assert.equal(contracts.childMessageSchema.safeParse({...message,...patch}).success,false)
})
