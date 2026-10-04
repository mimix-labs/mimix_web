import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import * as sdk from '../dist/index.js'
const fixtureUrl = new URL('../fixtures/minimal/', import.meta.url)

test('validator reports unsupported versions distinctly and field paths for invalid data', () => {
  assert.equal(typeof sdk.validateManifest, 'function')
  assert.equal(sdk.validateManifest({ schemaVersion: 2 }).error.code, 'UNSUPPORTED_VERSION')
  assert.equal(sdk.validateManifest({ apiVersion: 3 }).error.code, 'UNSUPPORTED_VERSION')
  const result = sdk.validateManifest({ schemaVersion: 1 })
  assert.equal(result.error.code, 'INVALID_MANIFEST')
  assert.ok(result.issues.some(issue => issue.path === 'id'))
  assert.equal(sdk.validateManifest(null).ok, false)
})

test('definition validates manifests without invoking factory', () => {
  assert.equal(typeof sdk.defineChallenge, 'function')
  let invoked = false
  assert.throws(() => sdk.defineChallenge({}, () => { invoked = true }), { code: 'INVALID_MANIFEST' })
  assert.equal(invoked, false)
})

test('fixture implements lifecycle and neutral API with a host-owned context', async () => {
  assert.equal(typeof sdk.defineChallenge, 'function')
  const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtureUrl), 'utf8'))
  const { createChallenge } = await import(new URL('index.js', fixtureUrl))
  const definition = sdk.defineChallenge(manifest, createChallenge)
  const events = []
  const speech = []
  const intents = []
  const controller = new AbortController()
  const mimix = {
    agent: { async speak(input) { speech.push(input) } },
    progress: { async record(input) { events.push(input) } },
    embodiment: { async perform(input) { intents.push(input) } },
  }
  const lifecycle = definition.create({ mimix, capabilities: ['progress', 'agent', 'embodiment'], signal: controller.signal })
  await lifecycle.initialize()
  await lifecycle.start()
  await lifecycle.pause()
  await lifecycle.resume()
  controller.abort()
  await lifecycle.dispose()
  await lifecycle.dispose()
  assert.deepEqual(events, [{ type: 'answer_submitted', payload: { correct: true } }, { type: 'attempt_completed', payload: {} }])
  assert.deepEqual(speech, [{ text: 'Dos más dos son cuatro.' }])
  assert.deepEqual(intents, [{ intent: 'celebrate' }])
  // Optional capabilities denied: local challenge remains usable.
  const offline = definition.create({ mimix: { progress: mimix.progress }, capabilities: ['progress'], signal: new AbortController().signal })
  await offline.initialize()
  await offline.start()
  await offline.dispose()
})
