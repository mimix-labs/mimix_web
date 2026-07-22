import * as THREE from 'three'
import { WALLE_ANIMATIONS } from './animations.js'

const WHEEL_NAMES = [
  'RUEDACORUGAD',
  'RUEDAGORUGAD',
  'RUEDACORUGAI',
  'RUEDAGORUGAI',
]

// El GLB de Wall-E exporta las geometrías colocadas en el espacio local,
// pero sus nodos no traen pivotes. Este animador inserta pivotes en posiciones
// reales de las mallas antes de animarlas, evitando que giren alrededor de 0,0,0.
export class WallEAnimator {
  constructor(root) {
    this.root = root
    this.baseY = root.position.y
    this.time = 0
    this.idleElapsed = 0
    this.nextExpression = this._nextExpressionDelay()
    this.expression = null
    this.action = null

    this.wheels = WHEEL_NAMES
      .map(name => this._makePivot(name))
      .filter(Boolean)

    this.neck = this._makePivot('CUELLO1', { useBottom: true })
    this.rightArm = this._makePivot('BRAZOD')
    this.leftArm = this._makePivot('BRAZOI')
  }

  update(delta, isMoving) {
    this.time += delta
    this._resetPose()

    if (this.action && this._animateAction(delta)) return

    if (isMoving) {
      this._animateMovement()
      return
    }

    this._animateIdle(delta)
  }

  play(name) {
    const animation = WALLE_ANIMATIONS[name]
    if (!animation) return false
    this.action = { ...animation, elapsed: 0 }
    return true
  }

  // La f\u00edsica del personaje actualiza esta altura; las animaciones solo
  // aplican una peque\u00f1a oscilaci\u00f3n visual alrededor de ella.
  setGroundHeight(height) {
    this.baseY = height
  }

  _animateAction(delta) {
    this.action.elapsed += delta
    const progress = Math.min(this.action.elapsed / this.action.duration, 1)
    const envelope = Math.sin(progress * Math.PI)

    if (this.action.behavior === 'greeting') {
      this.root.position.y = this.baseY + Math.sin(progress * Math.PI * 2) * 0.035
      if (this.neck) {
        this.neck.rotation.y = Math.sin(progress * Math.PI * 2) * 0.26
        this.neck.rotation.x = -0.08 * envelope
      }
      if (this.rightArm) {
        // Brazo elevado y cuatro saludos visibles mientras se mantiene arriba.
        this.rightArm.rotation.z = 0.98 * envelope + Math.sin(progress * Math.PI * 8) * 0.3 * envelope
        this.rightArm.rotation.x = Math.sin(progress * Math.PI * 8) * 0.24 * envelope
      }
      if (this.leftArm) this.leftArm.rotation.z = -0.2 * envelope
    }

    if (progress < 1) return true
    this.action = null
    return false
  }

  _animateMovement() {
    const cycle = this.time * 16
    const bounce = Math.abs(Math.sin(cycle)) * 0.065 + Math.sin(this.time * 31) * 0.012
    this.root.position.y = this.baseY + bounce
    this.root.rotation.z = Math.sin(cycle) * 0.026 + Math.sin(this.time * 29) * 0.007
    this.root.rotation.x = Math.sin(cycle * 0.5) * 0.014

    const wheelAngle = this.time * -20
    this.wheels.forEach(wheel => { wheel.rotation.x = wheelAngle })

    // Balanceo corto: acompaña el desplazamiento sin parecer una animación de saludo.
    if (this.rightArm) this.rightArm.rotation.z = Math.sin(cycle) * 0.11
    if (this.leftArm) this.leftArm.rotation.z = -Math.sin(cycle) * 0.11
    if (this.neck) {
      this.neck.rotation.y = Math.sin(cycle * 0.42) * 0.11
      this.neck.rotation.x = Math.sin(cycle * 0.75) * 0.07
      this.neck.rotation.z = Math.sin(cycle * 0.55) * 0.035
    }
  }

  _animateIdle(delta) {
    this.root.position.y = this.baseY + Math.sin(this.time * 2) * 0.008
    this.idleElapsed += delta

    if (!this.expression && this.idleElapsed >= this.nextExpression) {
      this.expression = Math.random() > 0.5 ? 'look' : 'wave'
      this.idleElapsed = 0
    }

    if (!this.expression) return

    const progress = Math.min(this.idleElapsed / 1.8, 1)
    const envelope = Math.sin(progress * Math.PI)

    if (this.expression === 'look' && this.neck) {
      this.neck.rotation.y = envelope * 0.35
      this.neck.rotation.x = envelope * -0.08
    }

    if (this.expression === 'wave' && this.rightArm) {
      this.rightArm.rotation.z = envelope * 0.42
      this.rightArm.rotation.x = Math.sin(progress * Math.PI * 4) * 0.12 * envelope
    }

    if (progress === 1) {
      this.expression = null
      this.idleElapsed = 0
      this.nextExpression = this._nextExpressionDelay()
    }
  }

  _makePivot(nodeName, { useBottom = false } = {}) {
    const node = this.root.getObjectByName(nodeName)
    if (!node?.isMesh || !node.parent) return null

    node.geometry.computeBoundingBox()
    const center = node.geometry.boundingBox.getCenter(new THREE.Vector3())
    if (useBottom) center.y = node.geometry.boundingBox.min.y + 0.04

    const pivot = new THREE.Group()
    pivot.name = `${nodeName}_PIVOT`
    node.parent.add(pivot)
    pivot.position.copy(center)
    pivot.attach(node)
    return pivot
  }

  _resetPose() {
    this.root.position.y = this.baseY
    this.root.rotation.x = 0
    this.root.rotation.z = 0
    this.wheels.forEach(wheel => wheel.rotation.set(0, 0, 0))
    this.neck?.rotation.set(0, 0, 0)
    this.rightArm?.rotation.set(0, 0, 0)
    this.leftArm?.rotation.set(0, 0, 0)
  }

  _nextExpressionDelay() {
    return 8 + Math.random() * 7
  }
}
