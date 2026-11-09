import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, PerspectiveCamera, Vector3 } from 'three'
import { World } from '../src/core/World.js'
import { ChallengeZone } from '../src/scenes/ChallengeZone.js'

test('restoring a view inside a portal waits for exit and a new entry before opening the challenge', () => {
  const player = new Group()
  let visits = 0
  const zone = new ChallengeZone({ scene: new Scene(), characters: { controller: { mesh: player } }, position: [0, 0, 0], radius: 2, label: 'Test', onEnter: () => visits++ })
  const world = {
    phase: 'exploring', characters: { active: player }, steamMap: { getGroundHeight: () => 0 },
    engine: { camera: new PerspectiveCamera(), controls: { target: new Vector3(), minDistance: 1, maxDistance: 30 }, render() {} },
    cameraFollower: { follow() {} }, mathChallenge: zone, scienceChallenge: { requireExitBeforeEntry() {} },
  }
  assert.equal(World.prototype.restoreView.call(world, { position: [0, 0, 0], rotation: 0, camera: [6, 7, 6], target: [0, 0, 0] }), true)
  zone.update(0.016, 1)
  zone.update(0.016, 2)
  assert.equal(visits, 0, 'a restored portal must not navigate immediately')
  player.position.x = 3
  zone.update(0.016, 3)
  player.position.x = 0
  zone.update(0.016, 4)
  assert.equal(visits, 1, 'leaving and re-entering must still open the challenge')
})
