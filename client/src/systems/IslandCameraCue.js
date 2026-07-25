import * as THREE from 'three'

// Starts a short cinematic view while Wall-E crosses the last part of a bridge.
// It ends before the player reaches the center of the destination island.
export class IslandCameraCue {
  constructor({ characters, cameraFollower, homePosition, islandPosition, titleHeight = 10 }) {
    this.characters = characters
    this.cameraFollower = cameraFollower
    this.islandPosition = new THREE.Vector3(...islandPosition)
    this.titleTarget = this.islandPosition.clone().add(new THREE.Vector3(0, titleHeight, 0))
    this.approachDirection = this.islandPosition.clone()
      .sub(new THREE.Vector3(...homePosition))
      .setY(0)
      .normalize()
    this.focusRadius = 42
    this.arrivalRadius = 28
    this.releaseRadius = 47
    this.active = false
  }

  update() {
    const player = this.characters.active
    if (!player) return

    const distance = player.position.clone().setY(0).distanceToSquared(this.islandPosition)
    const focusDistance = this.focusRadius * this.focusRadius
    const arrivalDistance = this.arrivalRadius * this.arrivalRadius
    const releaseDistance = this.releaseRadius * this.releaseRadius

    if (!this.active && distance <= focusDistance && distance > arrivalDistance) {
      this.active = true
      this.cameraFollower.beginIslandFocus({
        target: this.titleTarget,
        approachDirection: this.approachDirection,
      })
      return
    }

    if (this.active && (distance <= arrivalDistance || distance > releaseDistance)) {
      this.active = false
      this.cameraFollower.endIslandFocus()
    }
  }
}
