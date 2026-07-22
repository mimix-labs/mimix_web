import * as THREE from 'three'

// Estación visible que abre un reto cuando el personaje entra en su radio.
export class ChallengeZone {
  constructor({ scene, characters, position, radius, label, destination }) {
    this.characters = characters
    this.position = new THREE.Vector3(...position)
    this.radius = radius
    this.destination = destination
    this.opened = false

    this.group = new THREE.Group()
    this.group.position.copy(this.position)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.62, radius * 0.7, 48),
      new THREE.MeshBasicMaterial({ color: 0xF5C400, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 2.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xF5C400, transparent: true, opacity: 0.75 })
    )
    beacon.position.y = 1.1
    beacon.name = `${label}-beacon`

    this.group.add(ring, beacon)
    this.ring = ring
    this.beacon = beacon
    scene.add(this.group)
  }

  update(_delta, elapsed) {
    if (this.opened) return

    const pulse = 1 + Math.sin(elapsed * 2.5) * 0.1
    this.ring.scale.setScalar(pulse)
    this.beacon.scale.y = 0.9 + Math.sin(elapsed * 2.5) * 0.1

    const player = this.characters.controller?.mesh
    if (!player) return

    const distanceSquared = player.position.clone().setY(0).distanceToSquared(this.position)
    if (distanceSquared <= this.radius * this.radius) this._openChallenge()
  }

  _openChallenge() {
    this.opened = true
    window.location.assign(this.destination)
  }
}
