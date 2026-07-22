import { Engine } from './Engine.js'
import { Loop } from './Loop.js'
import * as THREE from 'three'
import { SteamMap } from '../scenes/SteamMap.js'
import { InputSystem } from '../systems/InputSystem.js'
import { CameraFollower } from '../systems/CameraFollower.js'
import { CharacterManager } from '../entities/CharacterManager.js'
import { StartRing } from '../fx/StartRing.js'
import { ChallengeZone } from '../scenes/ChallengeZone.js'

export class World {
  constructor() {
    this.engine    = new Engine('canvas')
    this.loop      = new Loop(this.engine)
    this.input     = new InputSystem()
    this.steamMap  = new SteamMap(this.engine.scene)
    this.startRing = new StartRing(this.engine.scene)
    this.cameraFollower = new CameraFollower({
      camera: this.engine.camera,
      controls: this.engine.controls,
    })

    this.characters = new CharacterManager({
      scene: this.engine.scene,
      input: this.input,
      collisionWorld: this.steamMap,
    })

    this.mathChallenge = new ChallengeZone({
      scene: this.engine.scene,
      characters: this.characters,
      position: [0, 0, -7],
      radius: 2.2,
      label: 'Matemáticas',
      destination: '/challenges/mathematics/index.html',
    })

    this.scienceChallenge = new ChallengeZone({
      scene: this.engine.scene,
      characters: this.characters,
      position: [7, 0, 0],
      radius: 2.2,
      label: 'Ciencias',
      destination: '/challenges/science/index.html',
    })

    this.loop.add(this.steamMap)
    this.loop.add(this.characters)
    this.loop.add(this.cameraFollower)
    this.loop.add(this.startRing)
    this.loop.add(this.mathChallenge)
    this.loop.add(this.scienceChallenge)
    this.loop.start()
  }

  // Called from main.js once walle.glb is available
  async loadWallE() {
    const { WALLE } = await import('../entities/walle/WallE.js')
    await this.steamMap.ready
    const cameraDirection = this.engine.camera.getWorldDirection(new THREE.Vector3())
    cameraDirection.y = 0
    cameraDirection.normalize()

    const controller = await this.characters.load(WALLE.modelPath, WALLE.spawnPosition, {
      facingDirection: cameraDirection,
    })
    this.cameraFollower.follow(this.characters.active)
    controller.playAction('greeting')
  }
}
