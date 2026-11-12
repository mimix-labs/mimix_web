import * as THREE from 'three'

const DURATION = 0.9

// A preview of the active character, independent of its geometry.
export class WorldIntro {
  constructor({ scene, character, camera, controls, input, animations = [], poseAnimator = null, canvas = null, onComplete, onTransition = () => {}, motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'), now = () => performance.now() }) {
    this.character = character
    this.camera = camera
    this.controls = controls
    this.input = input
    this.onComplete = onComplete
    this.onTransition = onTransition
    this.motionQuery = motionQuery
    this.reducedMotion = motionQuery?.matches ?? false
    this.phase = 'intro'
    this.elapsed = 0
    this.now = now
    this.previousTime = now()
    this.disposed = false
    this.canvas = canvas
    this.pointer = new THREE.Vector2()
    this.tilt = new THREE.Vector2()
    this.nextWave = 5
    this.waveRemaining = 0
    this.mixer = new THREE.AnimationMixer(character)
    this.actions = new Map()
    for (const source of animations.filter(clip => ['Float', 'Idle', 'Wave'].includes(clip.name))) {
      const clip = source.clone()
      // Keep the same floating anchor while waving; baked ground translation
      // must not make the character fall during the greeting.
      clip.tracks = clip.tracks.filter(track => !track.name.startsWith('Root.'))
      this.actions.set(clip.name, this.mixer.clipAction(clip))
    }
    // Use authored clips when available; keep procedural rigs as a fallback.
    this.poseAnimator = this.actions.size ? null : poseAnimator
    if (this.reducedMotion) this.poseAnimator?.reset()
    this.baseClip = this.actions.has('Float') ? 'Float' : 'Idle'
    if (!this.reducedMotion) this._playClip(this.baseClip)
    this.mixer.update(0)
    this.groundPosition = character.position.clone()
    this.groundRotation = character.rotation.clone()
    this.previewPosition = this.groundPosition.clone().add(new THREE.Vector3(0, 1.4, 0))
    this.mapFov = camera.fov
    this.mapTarget = this.groundPosition.clone()
    this.mapCamera = camera.position.clone().sub(controls.target).add(this.mapTarget)
    this.controlsEnabled = controls.enabled
    this.worldObjects = scene.children
      .filter(object => !object.isLight && object !== character && !object.userData.worldBackground && object.name !== 'SpaceParticles')
      .map(object => ({ object, visible: object.visible, scale: object.scale.clone() }))
    for (const { object } of this.worldObjects) object.visible = false

    const center = new THREE.Box3().setFromObject(character).getCenter(new THREE.Vector3())
    this.previewTarget = center.add(new THREE.Vector3(0, 1.4, 0))
    this.previewCamera = this.previewTarget.clone().add(new THREE.Vector3(5.8, 1.7, 5.8))
    this.previewRotation = this.groundRotation.clone()
    if (this.actions.has('Float')) this.previewRotation.y = Math.PI / 4 - 0.22
    character.position.copy(this.previewPosition)
    controls.enabled = false
    input.setEnabled(false)
    controls.target.copy(this.previewTarget)
    camera.position.copy(this.previewCamera)
    camera.fov = 40
    camera.updateProjectionMatrix()

    this.onPointerMove = event => {
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height || this.phase !== 'intro') return
      this.pointer.set(
        THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1),
      )
    }
    this.onPointerLeave = () => this.pointer.set(0, 0)
    canvas?.addEventListener('pointermove', this.onPointerMove)
    canvas?.addEventListener('pointerleave', this.onPointerLeave)

    this.onMotionChange = () => {
      this.reducedMotion = motionQuery.matches
      if (this.reducedMotion) {
        this.poseAnimator?.reset()
        this.mixer.stopAllAction()
        this.currentAction = null
        this.waveRemaining = 0
      } else if (this.phase === 'intro') this._playClip(this.baseClip)
      if (this.reducedMotion && this.phase === 'transition') this._finish()
    }
    motionQuery?.addEventListener('change', this.onMotionChange)
  }

  get active() { return !this.disposed && this.phase !== 'exploring' }

  _playClip(name) {
    const next = this.actions.get(name)
    if (!next) return
    this.currentAction?.fadeOut(0.35)
    next.reset().setLoop(name === 'Wave' ? THREE.LoopOnce : THREE.LoopRepeat, name === 'Wave' ? 1 : Infinity)
    next.clampWhenFinished = name === 'Wave'
    next.fadeIn(0.35).play()
    this.currentAction = next
  }

  start() {
    if (this.disposed || this.phase !== 'intro') return false
    this.phase = 'transition'
    this.elapsed = 0
    this.previousTime = this.now()
    this.transitionPosition = this.character.position.clone()
    this.transitionRotation = this.character.rotation.clone()
    for (const { object, visible, scale } of this.worldObjects) {
      object.visible = visible
      object.scale.copy(scale).multiplyScalar(0.01)
    }
    if (this.reducedMotion) this._finish()
    return true
  }

  update(_delta) {
    if (!this.active) return
    const now = this.now()
    // Presentation duration uses real time; the physics loop deliberately
    // clamps simulation delta on slow frames and must not stretch this entry.
    const delta = (globalThis.document?.hidden ?? false) ? 0 : Math.max(0, now - this.previousTime) / 1000
    this.elapsed += delta
    this.previousTime = now
    if (this.phase === 'intro') {
      this.character.position.copy(this.previewPosition)
      this.character.rotation.copy(this.previewRotation)
      if (!this.reducedMotion) {
        const step = Math.min(delta, 0.08)
        this.tilt.lerp(this.pointer, 1 - Math.exp(-step * 5))
        this.mixer.update(step)
        this.poseAnimator?.update(step, false)
        if (this.waveRemaining > 0) {
          this.waveRemaining -= step
          if (this.waveRemaining <= 0) this._playClip(this.baseClip)
        } else if (this.elapsed >= this.nextWave && this.actions.has('Wave')) {
          this._playClip('Wave')
          this.waveRemaining = this.actions.get('Wave').getClip().duration
          this.nextWave = this.elapsed + 12 + Math.random() * 6
        }
        this.character.position.y += Math.sin(this.elapsed * 1.5) * 0.14
        this.character.rotation.y += this.tilt.x * 0.32
        this.character.rotation.x += this.tilt.y * 0.12
        this.character.rotation.z += Math.sin(this.elapsed * 0.9) * 0.025
      }
      return
    }
    const progress = Math.min(this.elapsed / DURATION, 1)
    const blend = 1 - (1 - progress) ** 3
    this.character.position.lerpVectors(this.transitionPosition, this.groundPosition, blend)
    this.character.rotation.x = THREE.MathUtils.lerp(this.transitionRotation.x, this.groundRotation.x, blend)
    this.character.rotation.y = THREE.MathUtils.lerp(this.transitionRotation.y, this.groundRotation.y, blend)
    this.character.rotation.z = THREE.MathUtils.lerp(this.transitionRotation.z, this.groundRotation.z, blend)
    this.controls.target.lerpVectors(this.previewTarget, this.mapTarget, blend)
    this.camera.position.lerpVectors(this.previewCamera, this.mapCamera, blend)
    this.camera.fov = THREE.MathUtils.lerp(40, this.mapFov, blend)
    this.camera.updateProjectionMatrix()
    for (const { object, scale } of this.worldObjects) object.scale.copy(scale).multiplyScalar(0.01 + blend * 0.99)
    this.onTransition(progress)
    if (progress === 1) this._finish()
  }

  _restore() {
    this.mixer.stopAllAction()
    this.poseAnimator?.reset()
    for (const { object, scale, visible } of this.worldObjects) {
      object.scale.copy(scale)
      object.visible = visible
    }
    this.character.position.copy(this.groundPosition)
    this.character.rotation.copy(this.groundRotation)
    this.controls.target.copy(this.mapTarget)
    this.camera.position.copy(this.mapCamera)
    this.camera.fov = this.mapFov
    this.camera.updateProjectionMatrix()
    this.onTransition(1)
  }

  _finish() {
    if (this.disposed || this.phase === 'exploring') return
    this._restore()
    this.phase = 'exploring'
    this.controls.enabled = this.controlsEnabled
    this.input.setEnabled(true)
    this.onComplete?.()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.motionQuery?.removeEventListener('change', this.onMotionChange)
    this.canvas?.removeEventListener('pointermove', this.onPointerMove)
    this.canvas?.removeEventListener('pointerleave', this.onPointerLeave)
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.character)
    if (this.phase !== 'exploring') this._restore()
    this.input.setEnabled(false)
  }
}
