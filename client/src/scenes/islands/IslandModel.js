import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(draco)

// Carga un GLB de isla, lo añade a la escena y vuelca sus dimensiones
// (ancho × alto × profundidad, en unidades del mundo) a la consola.
export class IslandModel {
  constructor(scene, modelPath, { position = [0, 0, 0] } = {}) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.position.set(...position)
    this.scene.add(this.group)
    this.colliders = []
    this.raycaster = new THREE.Raycaster()
    this.raycastOrigin = new THREE.Vector3()
    this.down = new THREE.Vector3(0, -1, 0)

    this.ready = this._load(modelPath)
  }

  async _load(modelPath) {
    const gltf = await loader.loadAsync(modelPath)
    const root = gltf.scene
    this.group.add(root)
    root.updateMatrixWorld(true)
    root.traverse(object => {
      if (!object.isMesh) return

      // Algunos GLB exportan las caras del suelo orientadas hacia abajo.
      // Para el raycast de terreno necesitamos poder tocarlas desde arriba.
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { material.side = THREE.DoubleSide })
      this.colliders.push(object)
    })

    // Medir la caja envolvente del modelo ya cargado
    const box  = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const ctr  = box.getCenter(new THREE.Vector3())

    console.log(
      `[IslandModel] ${modelPath}\n` +
      `  Ancho  (X): ${size.x.toFixed(2)} u\n` +
      `  Alto   (Y): ${size.y.toFixed(2)} u\n` +
      `  Fondo  (Z): ${size.z.toFixed(2)} u\n` +
      `  Centro: (${ctr.x.toFixed(2)}, ${ctr.y.toFixed(2)}, ${ctr.z.toFixed(2)})`
    )

  }

  getGroundHeight(x, z) {
    if (!this.colliders.length) return null

    this.raycastOrigin.set(x, 100, z)
    this.raycaster.set(this.raycastOrigin, this.down)
    const hit = this.raycaster.intersectObjects(this.colliders, true)[0]
    return hit ? hit.point.y : null
  }

  resolveMovement(from, desired, { clearance = 0.02, maxClimb = 0.18, maxDrop = 0.28 } = {}) {
    const currentGround = this.getGroundHeight(from.x, from.z)
    const nextGround = this.getGroundHeight(desired.x, desired.z)
    if (nextGround === null) return null

    if (currentGround !== null) {
      const heightChange = nextGround - currentGround
      if (heightChange > maxClimb || heightChange < -maxDrop) return null
    }

    return new THREE.Vector3(desired.x, nextGround + clearance, desired.z)
  }

  snapToGround(position, clearance = 0.02) {
    const ground = this.getGroundHeight(position.x, position.z)
    if (ground !== null) position.y = ground + clearance
    return position
  }

  dispose() {
    this.scene.remove(this.group)
  }
}
