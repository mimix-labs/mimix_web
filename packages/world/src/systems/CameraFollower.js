import * as THREE from 'three'

// Follows Wall-E while retaining the zoom chosen through MapControls.
// IslandCameraCue can temporarily request a cinematic framing.
export class CameraFollower {
  constructor({ camera, controls, smoothness = 7 }) {
    this.camera = camera
    this.controls = controls
    this.smoothness = smoothness
    this.targetObject = null
    this.normalOffset = new THREE.Vector3()
    this.desiredTarget = new THREE.Vector3()
    this.desiredCamera = new THREE.Vector3()
    this.focus = null
    this.returningToFollow = false
  }

  follow(object) {
    this.targetObject = object
    this.normalOffset.copy(this.camera.position).sub(this.controls.target)
  }

  beginIslandFocus({ target, approachDirection }) {
    if (!this.targetObject || this.focus) return

    // Store the current distance and angle so the return respects manual zoom.
    this.normalOffset.copy(this.camera.position).sub(this.controls.target)
    this.focus = {
      target: target.clone(),
      approachDirection: approachDirection.clone().normalize(),
    }
    this.returningToFollow = false
  }

  endIslandFocus() {
    if (!this.focus) return
    this.focus = null
    this.returningToFollow = true
  }

  update(delta) {
    if (!this.targetObject) return

    this.targetObject.getWorldPosition(this.desiredTarget)

    if (this.focus) {
      this._updateIslandFocus(delta)
      return
    }

    this._updateFollow(delta)
  }

  _updateIslandFocus(delta) {
    const { approachDirection, target } = this.focus
    const blend = 1 - Math.exp(-3.2 * delta)

    // Camera stays behind Wall-E and looks ahead at the island name.
    this.desiredCamera.copy(this.desiredTarget)
      .addScaledVector(approachDirection, -11)
      .add(new THREE.Vector3(0, 5.5, 0))

    this.controls.target.lerp(target, blend)
    this.camera.position.lerp(this.desiredCamera, blend)
  }

  _updateFollow(delta) {
    const blend = 1 - Math.exp(-this.smoothness * delta)
    this.desiredCamera.copy(this.desiredTarget).add(this.normalOffset)

    this.controls.target.lerp(this.desiredTarget, blend)
    this.camera.position.lerp(this.desiredCamera, blend)

    // Once the return transition finishes, accept subsequent manual zooms.
    if (this.returningToFollow) {
      if (this.camera.position.distanceTo(this.desiredCamera) < 0.03) {
        this.returningToFollow = false
      }
      return
    }

    this.normalOffset.copy(this.camera.position).sub(this.controls.target)
  }
}
