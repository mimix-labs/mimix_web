import { Engine } from './Engine.js'
import { Loop } from './Loop.js'
import * as THREE from 'three'
import { ISLAND_LAYOUT, SteamMap } from '../scenes/SteamMap.js'
import { InputSystem } from '../systems/InputSystem.js'
import { CameraFollower } from '../systems/CameraFollower.js'
import { IslandCameraCue } from '../systems/IslandCameraCue.js'
import { CharacterManager } from '../entities/CharacterManager.js'
import { StartRing } from '../fx/StartRing.js'
import { ChallengeZone } from '../scenes/ChallengeZone.js'
import { AssetLoader, disposeObject } from './assets.js'

// Keep the normal follow/zoom view; island cinematic camera cues are disabled.
const ENABLE_ISLAND_CAMERA_CUES = false

const LOAD_BYTES = {
  home: 11919488,
  mathematics: 13768428,
  science: 8173260,
  bridgeMathematics: 2239132,
  bridgeScience: 2239132,
  character: 250772,
}

// Challenge entrances: positioned on the Home-facing edge of each island.
// position uses [X, Y, Z]; radius is the activation distance in world units.
const CHALLENGE_LAYOUT = {
  mathematics: { position: [0, 0, -42], radius: 4.5 },
  science: { position: [42, 0, 0], radius: 4.5 },
}

export class World {
  constructor({ canvas, root, host, onLoadingProgress = null }) {
    this._started = false
    this._loadingProgress = Object.fromEntries(
      Object.entries(LOAD_BYTES).map(([key, total]) => [key, { loaded: 0, total }]),
    )
    this._onLoadingProgress = onLoadingProgress
    this.disposed = false
    this.host = host
    this.assets = new AssetLoader()
    this.engine = new Engine(canvas)
    this.loop      = new Loop(this.engine)
    this.input     = new InputSystem(root)
    this.steamMap  = new SteamMap(this.engine.scene, {
      assets: this.assets,
      onAssetProgress: (asset, event) => this._reportAssetProgress(asset, event),
    })
    // Loading begins in the map constructor, before the character import resolves.
    this.steamMap.ready.catch(() => {})
    this.startRing = new StartRing(this.engine.scene)
    this.cameraFollower = new CameraFollower({
      camera: this.engine.camera,
      controls: this.engine.controls,
    })

    this.characters = new CharacterManager({
      assets: this.assets,
      scene: this.engine.scene,
      input: this.input,
      collisionWorld: this.steamMap,
    })

    this.mathCameraCue = new IslandCameraCue({
      characters: this.characters,
      cameraFollower: this.cameraFollower,
      homePosition: ISLAND_LAYOUT.home.position,
      islandPosition: ISLAND_LAYOUT.mathematics.position,
    })
    this.scienceCameraCue = new IslandCameraCue({
      characters: this.characters,
      cameraFollower: this.cameraFollower,
      homePosition: ISLAND_LAYOUT.home.position,
      islandPosition: ISLAND_LAYOUT.science.position,
    })

    this.mathChallenge = new ChallengeZone({
      scene: this.engine.scene,
      characters: this.characters,
      position: CHALLENGE_LAYOUT.mathematics.position,
      radius: CHALLENGE_LAYOUT.mathematics.radius,
      label: 'Matemáticas',
      onEnter: () => this.host.openChallenge('mathematics'),
    })

    this.scienceChallenge = new ChallengeZone({
      scene: this.engine.scene,
      characters: this.characters,
      position: CHALLENGE_LAYOUT.science.position,
      radius: CHALLENGE_LAYOUT.science.radius,
      label: 'Ciencias',
      onEnter: () => this.host.openChallenge('science'),
    })

    this.loop.add(this.steamMap)
    this.loop.add(this.characters)
    this.loop.add(this.cameraFollower)
    if (ENABLE_ISLAND_CAMERA_CUES) {
      this.loop.add(this.mathCameraCue)
      this.loop.add(this.scienceCameraCue)
    }
    this.loop.add(this.startRing)
    this.loop.add(this.mathChallenge)
    this.loop.add(this.scienceChallenge)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.loop.stop()
    this.input.dispose()
    this.assets.dispose()
    this.characters.controller?.mixer?.stopAllAction()
    disposeObject(this.engine.scene)
    this.engine.scene.clear()
    this.engine.dispose()
  }

  // Called from main.js once walle.glb is available
  async loadWallE() {
    const { WALLE } = await import('../entities/walle/WallE.js')
    if (this.disposed) return
    const cameraDirection = this.engine.camera.getWorldDirection(new THREE.Vector3())
    cameraDirection.y = 0
    cameraDirection.normalize()

    this._onLoadingProgress?.({ progress: 5, message: 'Cargando el mapa completo…' })
    const [controller] = await Promise.all([
      this.characters.load(WALLE.modelPath, WALLE.spawnPosition, {
        facingDirection: cameraDirection,
        onProgress: event => this._reportAssetProgress('character', event),
      }),
      this.steamMap.ready,
    ])
    if (this.disposed) return
    this.steamMap.snapToGround(controller.mesh.position)
    this.cameraFollower.follow(this.characters.active)
    controller.playAction('greeting')
    this._startWhenReady()
  }

  _reportAssetProgress(asset, event) {
    if (this.disposed) return
    const state = this._loadingProgress[asset]
    if (!state || !event?.loaded) return
    state.total = event.total || state.total
    state.loaded = Math.min(event.loaded, state.total)

    const states = Object.values(this._loadingProgress)
    const loadedBytes = states.reduce((total, item) => total + item.loaded, 0)
    const totalBytes = states.reduce((total, item) => total + item.total, 0)
    const ratio = totalBytes ? loadedBytes / totalBytes : 0
    const progress = Math.min(99, Math.round(5 + (ratio * 94)))
    const loadedMb = Math.round(loadedBytes / 1048576)
    const totalMb = Math.round(totalBytes / 1048576)
    const message = ratio > 0.98
      ? 'Montando el mapa completo…'
      : `Cargando el mapa completo · ${loadedMb} de ${totalMb} MB`
    this._onLoadingProgress?.({ progress, message })
  }

  _startWhenReady() {
    if (!this._started) {
      this._started = true
      this.loop.start()
    }
    this._onLoadingProgress?.({ progress: 100, message: '¡Todo listo!' })
  }
}
