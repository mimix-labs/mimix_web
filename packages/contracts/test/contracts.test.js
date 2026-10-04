import assert from 'node:assert/strict'
import test from 'node:test'

import * as contracts from '../dist/index.js'
const manifest = {
  schemaVersion: 1, apiVersion: 1, id: 'minimal', version: '1.0.0',
  title: 'Reto mínimo', description: 'Un ejemplo de aprendizaje.', entrypoint: 'index.js',
  objectives: [{ id: 'answer', description: 'Responder una pregunta.' }],
  completion: { description: 'Una respuesta correcta.' },
  capabilities: { required: ['progress'], optional: ['agent', 'embodiment'] },
}

test('public manifest contract exists and accepts a minimal challenge', () => {
  assert.equal(typeof contracts.challengeManifestSchema?.safeParse, 'function')
  assert.deepEqual(contracts.challengeManifestSchema.parse(manifest), manifest)
})

test('manifest rejects unsupported versions, ambiguous capabilities and unsafe paths', () => {
  assert.ok(contracts.challengeManifestSchema)
  for (const patch of [
    { schemaVersion: 2 }, { apiVersion: 2 }, { version: '01.0.0' }, { version: '1.0.0+meta' },
    { version: '1.0.0-01' }, { id: 'bad/id' }, { title: '  ' }, { provider: 'secret' },
    { objectives: [] }, { objectives: [manifest.objectives[0], manifest.objectives[0]] },
    { capabilities: { required: ['progress', 'progress'], optional: [] } },
    { capabilities: { required: ['agent'], optional: ['agent'] } },
    { capabilities: { required: ['motors'], optional: [] } },
    ...['../x.js', '/x.js', 'https://x/x.js', 'a/../x.js', 'a\\x.js', '%2e/x.js',
      'x.js?token=a', 'x.js#fragment', './x.js', 'a//x.js', 'x.html'].map(entrypoint => ({ entrypoint })),
  ]) assert.equal(contracts.challengeManifestSchema.safeParse({ ...manifest, ...patch }).success, false, JSON.stringify(patch))
  assert.equal(contracts.challengeManifestSchema.safeParse({ ...manifest, version: '1.2.3-beta.1', entrypoint: 'dist/main.js' }).success, true)
})

test('learning payloads remain strict and exclude host-owned identity and sequencing', () => {
  assert.ok(contracts.learningRecordSchema)
  for (const value of [
    { type: 'answer_submitted', payload: { correct: true } },
    ...['hint_requested', 'attempt_completed', 'attempt_abandoned'].map(type => ({ type, payload: {} })),
  ]) assert.deepEqual(contracts.learningRecordSchema.parse(value), value)
  for (const value of [
    { type: 'answer_submitted', payload: { correct: 'true' } },
    { type: 'answer_submitted', payload: { correct: true, score: 100 } },
    { type: 'attempt_started', payload: {} },
    { type: 'attempt_completed', payload: {}, userId: 'external' },
    { type: 'hint_requested', payload: { token: 'external' } },
  ]) assert.equal(contracts.learningRecordSchema.safeParse(value).success, false)
})

test('agent, embodiment and errors expose bounded neutral values', () => {
  assert.ok(contracts.speakInputSchema)
  assert.deepEqual(contracts.speakInputSchema.parse({ text: 'Bien hecho' }), { text: 'Bien hecho' })
  for (const input of [{ text: '' }, { text: ' '.repeat(3) }, { text: 'a'.repeat(2001) }, { text: 'ok', voiceId: 'x' }]) {
    assert.equal(contracts.speakInputSchema.safeParse(input).success, false)
  }
  for (const intent of ['celebrate', 'encourage', 'acknowledge']) assert.equal(contracts.behaviorIntentSchema.parse({ intent }).intent, intent)
  assert.equal(contracts.behaviorIntentSchema.safeParse({ intent: 'motor', speed: 100 }).success, false)
  assert.equal(contracts.challengeErrorSchema.safeParse({ code: 'CAPABILITY_DENIED', message: 'No disponible' }).success, true)
  assert.equal(contracts.challengeErrorSchema.safeParse({ code: 'UNKNOWN', message: 'x' }).success, false)
})
