import * as THREE from 'three'
import { IslandModel } from './islands/IslandModel.js'
import { Bridge } from './islands/Bridge.js'

export const ISLAND_LAYOUT = {
  home:        { position: [0, 0, 0],   path: '/assets/models/islands/home.glb' },
  mathematics: { position: [0, 0, -62], path: '/assets/models/islands/mathematics.glb' },
  science:     { position: [62, 0, 0],  path: '/assets/models/islands/sciencie.glb' },
}

const ISLAND_EDGE = 25.6
const BRIDGE_OVERLAP = 0.35

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

    this.bridges = [
      this._createBridge('home', 'mathematics', 0x4FC3F7),
      this._createBridge('home', 'science', 0x66BB6A),
    ]
    this.bridges.forEach(bridge => this.scene.add(bridge.group))

    this.raycaster = new THREE.Raycaster()
    this.raycastOrigin = new THREE.Vector3()
    this.down = new THREE.Vector3(0, -1, 0)
  }

  _createBridge(fromKey, toKey, color) {
    const [fromX, , fromZ] = ISLAND_LAYOUT[fromKey].position
    const [toX, , toZ] = ISLAND_LAYOUT[toKey].position
    const direction = new THREE.Vector2(toX - fromX, toZ - fromZ).normalize()
    const from = {
      x: fromX + direction.x * (ISLAND_EDGE - BRIDGE_OVERLAP),
      z: fromZ + direction.y * (ISLAND_EDGE - BRIDGE_OVERLAP),
    }
    const to = {
      x: toX - direction.x * (ISLAND_EDGE - BRIDGE_OVERLAP),
      z: toZ - direction.y * (ISLAND_EDGE - BRIDGE_OVERLAP),
    }
    return new Bridge(from, to, { color, width: 3 })
  }

  update(_delta, _elapsed) {}

  get ready() {
    return Promise.all(Object.values(this.islands).map(island => island.ready))
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
