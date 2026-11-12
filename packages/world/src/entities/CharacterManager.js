import * as THREE from 'three'
import { CharacterController } from './CharacterController.js'

export class CharacterManager {
  constructor({ scene, input, assets, collisionWorld = null }) {
    this.assets = assets
    this.scene      = scene
    this.input      = input
    this.collisionWorld = collisionWorld
    this.controller = null
    this._active    = null  // currently loaded GLTF root
  }

  // Load a character GLB and activate it as the player
  async load(modelPath, spawnPosition = [0, 1, 0], {
    facingDirection = null,
    onProgress = null,
    height = null,
    clipNames = {},
  } = {}) {
    // Unload previous character if any
    if (this._active) {
      this.controller?.dispose()
      this.scene.remove(this._active)
      this._active = null
      this.controller = null
    }

    const gltf = await this.assets.load(modelPath, onProgress)
    const root = gltf.scene

    root.scale.setScalar(1)
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    if (height) {
      root.scale.setScalar(height / bounds.getSize(new THREE.Vector3()).y)
      root.updateMatrixWorld(true)
      bounds.setFromObject(root)
    }
    // Keep the authored rig inside a ground-level collision container.
    const visualOffsetY = -bounds.min.y
    const player = new THREE.Group()
    player.position.set(...spawnPosition)
    this.collisionWorld?.snapToGround(player.position)
    root.position.y = visualOffsetY

    // Three.js considera -Z como el frente local. Proyectamos la dirección
    // de la cámara al suelo para que el personaje mire donde ella apunta.
    if (facingDirection?.lengthSq() > 0) {
      player.rotation.y = Math.atan2(facingDirection.x, facingDirection.z) + Math.PI
    }

    root.visible = false
    player.add(root)
    this.scene.add(player)
    this._active = player

    this.controller = new CharacterController({
      mesh:       player,
      animations: gltf.animations,
      input:      this.input,
      clipNames,
      collisionWorld: this.collisionWorld,
    })
    root.visible = true

    return this.controller
  }

  // Hot-swap to a different character (keeps position)
  async swap(modelPath) {
    const pos = this._active?.position.toArray() ?? [0, 1, 0]
    return this.load(modelPath, pos)
  }

  update(delta) {
    this.controller?.update(delta)
  }

  get active() {
    return this._active
  }
}
