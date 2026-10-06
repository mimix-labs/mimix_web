import test from 'node:test'
import assert from 'node:assert/strict'
import math from '@mimix/challenge-mathematics/manifest.json' with { type: 'json' }
import science from '@mimix/challenge-science/manifest.json' with { type: 'json' }
import { createWorldHost } from '../src/host.js'

// Host-installed fixtures request progress; the shipped exploration manifests do not.
const challenges = [math, science].map(manifest => ({
  ...structuredClone(manifest),
  version: manifest.id === 'science' ? '2.0.0' : manifest.version,
  capabilities: { required: ['progress'], optional: [] },
}))
const mathAttempt = { challengeId: 'mathematics', challengeVersion: '1.0.0', attemptId: '11111111-1111-4111-8111-111111111111' }
const scienceAttempt = { challengeId: 'science', challengeVersion: '2.0.0', attemptId: '22222222-2222-4222-8222-222222222222' }
const record = { type: 'hint_requested', payload: {} }
const options = { challengeOrigin: 'https://edge.example', navigate() {}, challenges, grants: ['progress'] }

test('identical learning records keep their host-bound challenge, version and attempt across APIs', async () => {
  const calls = []
  const host = createWorldHost({ ...options, adapters: { progress: { async record(input, context) { calls.push({ input, context }) } } } })
  const binding = { ...mathAttempt }
  const mathematics = host.apiFor('mathematics', binding)
  const science = host.apiFor('science', scienceAttempt)
  const nextMathAttempt = { ...mathAttempt, attemptId: '33333333-3333-4333-8333-333333333333' }
  const mathematicsAgain = host.apiFor('mathematics', nextMathAttempt)
  // Caller mutation after binding must not reattribute an already-created API.
  Object.assign(binding, scienceAttempt)
  await Promise.all([
    mathematics.progress.record(record), science.progress.record(record), mathematicsAgain.progress.record(record),
  ])
  assert.deepEqual(calls.map(({ context: { signal, ...scope } }) => scope), [mathAttempt, scienceAttempt, nextMathAttempt])
  for (const call of calls) {
    assert.deepEqual(call.input, record)
    assert.equal(call.context.signal, host.signal)
    assert.equal(Object.isFrozen(call.context), true)
  }
  host.dispose()
})

test('missing, mismatched and forged attribution cannot reach the progress adapter', async () => {
  const calls = []
  const host = createWorldHost({ ...options, adapters: { progress: { async record(input, context) { calls.push({ input, context }) } } } })
  await assert.rejects(host.apiFor('mathematics').progress.record(record), { code: 'CAPABILITY_UNAVAILABLE' })
  assert.throws(() => host.apiFor('mathematics', scienceAttempt), /Attempt does not match/)
  assert.throws(() => host.apiFor('mathematics', { ...mathAttempt, challengeVersion: '2.0.0' }), /Attempt does not match/)
  assert.throws(() => host.apiFor('mathematics', { ...mathAttempt, attemptId: 'not-a-uuid' }))
  const api = host.apiFor('mathematics', mathAttempt)
  await assert.rejects(api.progress.record({ ...record, ...scienceAttempt }))
  await assert.rejects(api.progress.record({ ...record, payload: { attemptId: scienceAttempt.attemptId } }))
  assert.equal(calls.length, 0)
  // Extra child-controlled arguments cannot replace the closed-over host context.
  await api.progress.record(record, scienceAttempt)
  assert.equal(calls[0].context.challengeId, mathAttempt.challengeId)
  assert.equal(calls[0].context.attemptId, mathAttempt.attemptId)
  host.dispose()
  await assert.rejects(api.progress.record(record), { name: 'AbortError' })
})

test('an attempt binding cannot grant progress to the shipped exploration manifests', async () => {
  let calls = 0
  const host = createWorldHost({ challengeOrigin: options.challengeOrigin, navigate() {}, grants: ['progress'], adapters: { progress: { async record() { calls++ } } } })
  for (const binding of [mathAttempt, scienceAttempt]) {
    await assert.rejects(host.apiFor(binding.challengeId, { ...binding, challengeVersion: '1.0.0' }).progress.record(record), { code: 'CAPABILITY_UNAVAILABLE' })
  }
  assert.equal(calls, 0)
  host.dispose()
})

test('the host validates its catalog and snapshots it before creating challenge APIs', async () => {
  assert.throws(() => createWorldHost({ ...options, challenges: [challenges[0], challenges[0]] }), /Duplicate installed challenge/)
  assert.throws(() => createWorldHost({ ...options, challenges: [{ ...challenges[0], version: 'invalid' }] }))
  for (const id of ['.', '..']) assert.throws(() => createWorldHost({ ...options, challenges: [{ ...challenges[0], id }] }))
  const installed = structuredClone(challenges)
  const calls = []
  const host = createWorldHost({ ...options, challenges: installed, adapters: { progress: { async record(_input, context) { calls.push(context) } } } })
  installed[0].id = 'science'
  installed[0].version = '9.0.0'
  installed[0].capabilities.required.length = 0
  await host.apiFor('mathematics', mathAttempt).progress.record(record)
  assert.equal(calls[0].challengeId, mathAttempt.challengeId)
  assert.equal(calls[0].challengeVersion, mathAttempt.challengeVersion)
  host.dispose()
})
