import * as THREE from 'three'
import { getGesture } from './gestures.js'

const FADE_DURATION = 0.25 // seconds to blend between animations

export class CharacterController {
  constructor({ mesh, animations, input, proceduralAnimator = null, collisionWorld = null }) {
    this.mesh   = mesh
    this.input  = input

    this._mixer   = new THREE.AnimationMixer(mesh)
    this._actions = {}  // name → AnimationAction
    this._current = null

    this._speed     = 5
    this._direction = new THREE.Vector3()
    this._velocity  = new THREE.Vector3()
    this._proceduralAnimator = proceduralAnimator
    this._collisionWorld = collisionWorld

    this._buildActions(animations)
    this._collisionWorld?.snapToGround(this.mesh.position)
    this._proceduralAnimator?.setGroundHeight(this.mesh.position.y)
    this.play('idle')
  }

  // Pre-build all clips into reusable AnimationActions
  _buildActions(clips) {
    for (const clip of clips) {
      const action = this._mixer.clipAction(clip)
      this._actions[clip.name] = action
    }
  }

  // Play a gesture by name (defined in gestures.js)
  play(gestureName) {
    const gesture = getGesture(gestureName)
    const next    = this._actions[gesture.clip]

    if (!next || next === this._current) return

    next.setLoop(
      gesture.loop ? THREE.LoopRepeat : THREE.LoopOnce,
      gesture.loop ? Infinity : 1
    )
    next.timeScale   = gesture.timeScale
    next.clampWhenFinished = !gesture.loop
    next.reset().fadeIn(FADE_DURATION).play()

    if (this._current) this._current.fadeOut(FADE_DURATION)
    this._current = next
  }

  update(delta) {
    this._mixer.update(delta)
    const isMoving = this._handleMovement(delta)
    this._proceduralAnimator?.update(delta, isMoving)
  }

  _handleMovement(delta) {
    if (!this.input) return

    const { keys } = this.input
    this._direction.set(0, 0, 0)

    if (keys['ArrowUp']    || keys['KeyW']) this._direction.z -= 1
    if (keys['ArrowDown']  || keys['KeyS']) this._direction.z += 1
    if (keys['ArrowLeft']  || keys['KeyA']) this._direction.x -= 1
    if (keys['ArrowRight'] || keys['KeyD']) this._direction.x += 1

    const isMoving = this._direction.lengthSq() > 0

    if (isMoving) {
      this._direction.normalize()
      const desired = this.mesh.position.clone().addScaledVector(this._direction, this._speed * delta)
      const resolved = this._collisionWorld?.resolveMovement(this.mesh.position, desired) ?? desired
      if (resolved) {
        this.mesh.position.copy(resolved)
        this._proceduralAnimator?.setGroundHeight(this.mesh.position.y)
      }

      // Face direction of travel
      const angle = Math.atan2(this._direction.x, this._direction.z)
      this.mesh.rotation.y = angle

      this.play('walk')
    } else {
      this.play('idle')
    }

    return isMoving
  }

  playAction(name) {
    return this._proceduralAnimator?.play(name) ?? false
  }
}
