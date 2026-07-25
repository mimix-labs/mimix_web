import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import * as THREE from 'three'
import { CharacterController } from './CharacterController.js'
import { WallEAnimator } from './walle/WallEAnimator.js'

const loader = new GLTFLoader()

// DRACO decompression — required for compressed .glb files
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(draco)

export class CharacterManager {
  constructor({ scene, input, collisionWorld = null }) {
    this.scene      = scene
    this.input      = input
    this.collisionWorld = collisionWorld
    this.controller = null
    this._active    = null  // currently loaded GLTF root
  }

  // Load a character GLB and activate it as the player
  // modelPath: e.g. '/assets/models/walle/walle.glb'
  async load(modelPath, spawnPosition = [0, 1, 0], { facingDirection = null } = {}) {
    // Unload previous character if any
    if (this._active) {
      this.scene.remove(this._active)
      this._active = null
      this.controller = null
    }

    const gltf = await loader.loadAsync(modelPath)
    const root = gltf.scene

    root.scale.setScalar(1)
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    // GLB's root pivot is above the bottom of its tracks. Keep collisions on
    // a ground-level container and offset only the visible model.
    // CharacterController already contributes the 0.02 ground clearance.
    // Keep the visual base aligned with that collision anchor.
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
      proceduralAnimator: root.getObjectByName('TORSO')
        ? new WallEAnimator(root, { groundOffset: visualOffsetY, lockToLocalGround: true })
        : null,
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
