import test from 'node:test'
import assert from 'node:assert/strict'
import { Loop } from '../src/core/Loop.js'
import { createWorldHost } from '../src/host.js'

test('stopping cancels the outstanding frame; starting twice keeps one loop', () => {
  const pending = new Map(); let next = 0
  globalThis.requestAnimationFrame = callback => { pending.set(++next, callback); return next }
  globalThis.cancelAnimationFrame = id => pending.delete(id)
  const loop = new Loop({ render() {} })
  loop.start(); loop.start()
  assert.equal(pending.size, 1)
  loop.stop()
  assert.equal(pending.size, 0)
  delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame
})

test('challenge entry uses an installed manifest and fixed host, never arbitrary navigation', () => {
  const visits = []
  const host = createWorldHost({ challengeOrigin: 'https://edge.example', navigate: url => visits.push(url), vision: 'robot' })
  host.openChallenge('mathematics')
  assert.deepEqual(visits, ['https://edge.example/challenges/mathematics/index.html?vision=robot'])
  assert.throws(() => host.openChallenge('https://evil.example'))
  host.dispose()
  assert.throws(() => host.openChallenge('science'))
})

test('exploration does not grant learning writes or fabricate completion', async () => {
  let records = 0
  const host = createWorldHost({ challengeOrigin: 'https://edge.example', navigate() {}, adapters: { progress: { async record() { records++ } } } })
  await assert.rejects(host.apiFor('mathematics').progress.record({ type: 'attempt_completed', payload: {} }), { code: 'CAPABILITY_UNAVAILABLE' })
  assert.equal(records, 0)
  host.dispose()
})

test('Agent Core output is validated, explicit recommendation navigation preserves version', () => {
  const host = createWorldHost({ challengeOrigin: 'https://edge.example', navigate() {} })
  assert.throws(() => host.acceptTurn({ text: 'untrusted', url: 'https://evil.example' }))
  assert.throws(() => host.acceptTurn({ schemaVersion: 1, id: '00000000-0000-4000-8000-000000000001', characterId: 'walle', text: 'Explora', recommendations: [{ kind: 'start_challenge', campaignId: 'demo', campaignVersion: '1.0.0', nodeId: 'math', challengeId: 'mathematics', challengeVersion: '99.0.0' }], toolResults: [], source: 'deterministic' }))
  host.dispose()
})

test('a real Agent Core turn crosses the host boundary without automatic navigation', async () => {
  const { AgentCore } = await import('@mimix/agent-core')
  const { wallEProfile } = await import('@mimix/character-wall-e')
  const { context, authorization, input } = await import('../../agent-contract/test/fixtures.js')
  const snapshot = structuredClone(context)
  snapshot.campaign.nodes[0].challengeId = 'mathematics'
  const turn = await new AgentCore().turn(input, snapshot, authorization, wallEProfile)
  const visits = []
  const host = createWorldHost({ challengeOrigin: 'https://edge.example', navigate: url => visits.push(url) })
  assert.deepEqual(host.acceptTurn(turn), turn)
  assert.equal(visits.length, 0)
  host.followRecommendation()
  assert.deepEqual(visits, ['https://edge.example/challenges/mathematics/index.html'])
  host.dispose()
})

test('authorized semantic outputs stop synchronously on handoff, revoked permit and disposal', async () => {
  let stopped = 0; const signals = []
  const agent = { count: 0, async speak(_input, { signal }) { this.count++; signals.push(signal) } }
  const host = createWorldHost({ challengeOrigin: 'https://edge.example', navigate() {}, grants: ['agent', 'embodiment', 'progress'], adapters: { agent, stop() { stopped++ } } })
  const api = host.apiFor('mathematics')
  await assert.rejects(api.agent.speak({ text: 'Hola' }), { code: 'CAPABILITY_UNAVAILABLE' })
  const controller = new AbortController()
  const lease = { schemaVersion: 1, conversationId: '22222222-2222-4222-8222-222222222222', leaseId: '11111111-1111-4111-8111-111111111111', holderId: '33333333-3333-4333-8333-333333333333', kind: 'web', revision: 1, expiresAt: Date.now() + 10000 }
  const permit = { leaseId: lease.leaseId, signal: controller.signal, isCurrent: () => true }
  host.setEmbodiment({ schemaVersion: 1, phase: 'virtual', lease, webMuted: false }, permit)
  await api.agent.speak({ text: 'Hola' })
  assert.equal(agent.count, 1)
  assert.equal(signals[0].aborted, false)
  host.setEmbodiment({ schemaVersion: 1, phase: 'robot', lease: { ...lease, kind: 'robot', revision: 2 }, webMuted: true })
  assert.equal(signals[0].aborted, true)
  await assert.rejects(api.agent.speak({ text: 'Hola' }), { code: 'CAPABILITY_UNAVAILABLE' })
  host.setEmbodiment({ schemaVersion: 1, phase: 'virtual', lease, webMuted: false }, permit)
  await api.agent.speak({ text: 'Otra vez' })
  const before = stopped; controller.abort()
  assert.equal(stopped, before + 1)
  assert.equal(signals[1].aborted, true)
  await assert.rejects(api.agent.speak({ text: 'No' }), { code: 'CAPABILITY_UNAVAILABLE' })
  await assert.rejects(api.progress.record({ type: 'attempt_completed', payload: {} }), { code: 'CAPABILITY_UNAVAILABLE' })
  host.dispose()
  await assert.rejects(api.agent.speak({ text: 'No' }), { name: 'AbortError' })
})

test('disposal during map loading observes every rejected asset promise', async () => {
  const { SteamMap } = await import('../src/scenes/SteamMap.js')
  const { Scene } = await import('three')
  const pending = []
  const assets = { load: () => new Promise((_resolve, reject) => pending.push(reject)) }
  const errors = []; const handler = error => errors.push(error)
  process.on('unhandledRejection', handler)
  try {
    const map = new SteamMap(new Scene(), { assets })
    const ready = assert.rejects(map.ready, { name: 'AbortError' })
    for (const reject of pending) reject(new DOMException('Disposed', 'AbortError'))
    await ready
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(errors, [])
  } finally { process.off('unhandledRejection', handler) }
})

test('disposal releases shared geometry/material/texture once and aborts downloads', async () => {
  const { AssetLoader, disposeObject } = await import('../src/core/assets.js')
  let geometry = 0, material = 0, texture = 0, bitmap = 0
  const resource = { isTexture: true, dispose() { texture++ }, source: { data: { close() { bitmap++ } } } }
  const mesh = { geometry: { dispose() { geometry++ } }, material: { map: resource, dispose() { material++ } } }
  disposeObject({ traverse(callback) { callback(mesh); callback(mesh) } })
  assert.deepEqual([geometry, material, texture, bitmap], [1, 1, 1, 1])
  const original = globalThis.fetch
  let signal
  globalThis.fetch = async (_url, options) => {
    signal = options.signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  }
  try {
    const loader = new AssetLoader()
    const pending = assert.rejects(loader.load('/model.glb'), { name: 'AbortError' })
    loader.dispose()
    await pending
    assert.equal(signal.aborted, true)
    assert.equal(loader.pending, 0)
  } finally { globalThis.fetch = original }
})
