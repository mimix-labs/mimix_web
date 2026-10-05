import assert from 'node:assert/strict'
import test from 'node:test'
import * as contract from '../dist/index.js'
const profile = { schemaVersion: 1, id: 'guide', version: '1.0.0', displayName: 'Guía',
  persona: { description: 'Un guía curioso.', tone: 'warm', locale: 'es' },
  appearance: { assetId: 'guide-model', animations: { idle: 'idle', encourage: 'wave', celebrate: 'jump' } } }

test('replaceable character accepts presentation data and excludes tools, provider config and hardware', () => {
  assert.ok(contract.characterProfileSchema)
  assert.deepEqual(contract.characterProfileSchema.parse(profile), profile)
  for (const patch of [{ schemaVersion: 2 }, { displayName: ' ' }, { id: '../x' },
    { tools: ['motor'] }, { permissions: ['*'] }, { voiceId: 'provider' },
    { persona: { ...profile.persona, systemPrompt: 'execute tools' } },
    { appearance: { ...profile.appearance, motor: 100 } },
  ]) assert.equal(contract.characterProfileSchema.safeParse({ ...profile, ...patch }).success, false)
})
