import assert from 'node:assert/strict'
import test from 'node:test'
import { experienceReturnTo, worldViewFromStorage } from '../src/lib/experience-navigation.ts'

test('experience return is a canonical internal destination, never an external or ambiguous URL', () => {
  assert.equal(experienceReturnTo('/mundo'), '/mundo')
  assert.equal(experienceReturnTo('/play'), '/mundo')
  assert.equal(experienceReturnTo('/'), '/')
  for (const value of [undefined, '', '//evil.test', '/\\evil.test', 'https://evil.test', '/acceso', '/perfil', '/mundo?redirect_url=https://evil.test', '/%2f%2fevil.test', '/mundo#foo']) {
    assert.equal(experienceReturnTo(value), '/')
  }
})

test('stored world context is bounded, short lived and cannot claim authentication', () => {
  const view = { position: [1, 0.3, 1], rotation: 0.2, camera: [6, 7, 6], target: [1, 1, 1] }
  assert.deepEqual(worldViewFromStorage(JSON.stringify({ at: 1000, view }), 1100), view)
  for (const raw of ['bad json', '{}', JSON.stringify({ at: 0, view }), JSON.stringify({ at: 2000, view }), JSON.stringify({ at: 1000, view: { ...view, position: [1e9, 0, 0] } })]) {
    assert.equal(worldViewFromStorage(raw, 31 * 60 * 1000), null)
  }
  assert.equal(worldViewFromStorage(JSON.stringify({ at: 1000, view: { ...view, signedIn: true } }), 1100), null)
})
