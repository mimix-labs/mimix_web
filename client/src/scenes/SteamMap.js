import * as THREE from 'three'

const ISLANDS = [
  { id: 'science',     label: 'Science',     color: 0x4fc3f7, pos: [ 0,  0, -12] },
  { id: 'technology',  label: 'Technology',  color: 0x81c784, pos: [ 12, 0,  0 ] },
  { id: 'engineering', label: 'Engineering', color: 0xffb74d, pos: [ 0,  0,  12] },
  { id: 'art',         label: 'Art',         color: 0xce93d8, pos: [-12, 0,  0 ] },
  { id: 'math',        label: 'Mathematics', color: 0xfff176, pos: [ 0,  0,  0 ] },
]

export class SteamMap {
  constructor(scene) {
    this.scene = scene
    this._build()
  }

  _build() {
    this._buildGround()
    this._buildIslands()
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(80, 80, 1, 1)
    const mat = new THREE.MeshLambertMaterial({ color: 0x6ab04c })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.5
    this.scene.add(ground)
  }

  _buildIslands() {
    for (const island of ISLANDS) {
      const group = new THREE.Group()

      // Base platform
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.8, 6),
        new THREE.MeshLambertMaterial({ color: island.color })
      )
      group.add(base)

      // Marker cube on top
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1.5, 1),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      )
      marker.position.y = 1.15
      group.add(marker)

      group.position.set(...island.pos)
      group.userData = { islandId: island.id, label: island.label }
      this.scene.add(group)
    }
  }

  update(_delta, elapsed) {
    // reserved for future island animations
  }
}
