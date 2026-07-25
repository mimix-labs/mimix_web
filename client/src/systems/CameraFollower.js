import * as THREE from 'three'

// Mantiene el encuadre elegido en Engine, traslad\u00e1ndolo suavemente con el jugador.
export class CameraFollower {
  constructor({ camera, controls, smoothness = 7 }) {
    this.camera = camera
    this.controls = controls
    this.smoothness = smoothness
    this.targetObject = null
    this.offset = new THREE.Vector3()
    this.desiredTarget = new THREE.Vector3()
  }

  follow(object) {
    this.targetObject = object
    this.offset.copy(this.camera.position).sub(this.controls.target)
  }

  update(delta) {
    if (!this.targetObject) return

    // MapControls puede cambiar la distancia con la rueda. Capturamos ese
    // desplazamiento antes de seguir a Wall-E para trasladar la cámara sin
    // reimponer la distancia con la que inició el juego.
    this.offset.copy(this.camera.position).sub(this.controls.target)
    this.targetObject.getWorldPosition(this.desiredTarget)
    const blend = 1 - Math.exp(-this.smoothness * delta)
    this.controls.target.lerp(this.desiredTarget, blend)
    this.camera.position.lerp(this.desiredTarget.clone().add(this.offset), blend)
  }
}
