import * as THREE from 'three'
import { IslandModel } from './islands/IslandModel.js'
import { BridgeModel } from './islands/BridgeModel.js'

export const ISLAND_LAYOUT = {
  home:        { position: [0, 0, 0],   path: '/assets/models/islands/home.glb' },
  mathematics: { position: [0, 0, -62], path: '/assets/models/islands/mathematics.glb' },
  science:     { position: [62, 0, 0],  path: '/assets/models/islands/sciencie.glb' },
}

const BRIDGE_MODEL_PATH = '/assets/models/resources/bridge.glb'

// Edit these values to place the original bridge model manually.
// position: [X, Y, Z] | rotationY: radians | scale: [X, Y, Z]
export const BRIDGE_LAYOUT = {
  mathematics: {
    position: [0, 0.3, -31],
    rotationY: Math.PI / 2,
    scale: [1, 1, 1],
  },
  science: {
    position: [31, 0.3, 0],
    rotationY: 0,
    scale: [1, 1, 1],
  },
}

// Loads the complete three-island world and treats all floor meshes as one
// collision surface for Wall-E.
export class SteamMap {
  constructor(scene) {
    this.scene = scene
    this._build()
  }

  _build() {
    const grid = new THREE.GridHelper(42, 42, 0x333344, 0x202834)
    this.scene.add(grid)

    this.islands = Object.fromEntries(Object.entries(ISLAND_LAYOUT).map(([key, config]) => [
      key,
      new IslandModel(this.scene, config.path, { position: config.position }),
    ]))

    this.islands.science.group.rotation.y = -Math.PI / 2

    this.bridges = [
      this._createBridge('mathematics'),
      this._createBridge('science'),
    ]
    this.bridges.forEach(bridge => this.scene.add(bridge.group))

    this.raycaster = new THREE.Raycaster()
    this.raycastOrigin = new THREE.Vector3()
    this.down = new THREE.Vector3(0, -1, 0)
  }

  _createBridge(key) {
    return new BridgeModel({
      modelPath: BRIDGE_MODEL_PATH,
      ...BRIDGE_LAYOUT[key],
    })
  }

  update(_delta, _elapsed) {}

  get ready() {
    return Promise.all([
      ...Object.values(this.islands).map(island => island.ready),
      ...this.bridges.map(bridge => bridge.ready),
    ])
  }

  get colliders() {
    return [
      ...Object.values(this.islands).flatMap(island => island.colliders),
      ...this.bridges.flatMap(bridge => bridge.colliders),
    ]
  }

  getGroundHeight(x, z) {
    const colliders = this.colliders
    if (!colliders.length) return null

    this.raycastOrigin.set(x, 100, z)
    this.raycaster.set(this.raycastOrigin, this.down)
    const hit = this.raycaster.intersectObjects(colliders, true)[0]
    return hit ? hit.point.y : null
  }

  resolveMovement(from, desired) {
    const currentGround = this.getGroundHeight(from.x, from.z)
    const nextGround = this.getGroundHeight(desired.x, desired.z)
    if (nextGround === null) return null

    if (currentGround !== null) {
      const heightChange = nextGround - currentGround
      if (heightChange > 0.18 || heightChange < -0.28) return null
    }
    return new THREE.Vector3(desired.x, nextGround + 0.02, desired.z)
  }

  snapToGround(position) {
    const ground = this.getGroundHeight(position.x, position.z)
    if (ground !== null) position.y = ground + 0.02
    return position
  }
}
