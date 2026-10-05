import assert from 'node:assert/strict'
import test from 'node:test'
import * as contract from '@mimix/character-contract'
import * as character from '../dist/index.js'

test('Wall-E is a standalone valid CharacterProfile', () => {
  assert.ok(character.wallEProfile)
  assert.equal(contract.characterProfileSchema.parse(character.wallEProfile).id, 'wall-e')
})
