import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(draco)

// Places a bridge GLB without deforming its authored proportions.
export class BridgeModel {
  constructor({ modelPath, position, rotationY = 0, scale = [1, 1, 1] } = {}) {
    this.group = new THREE.Group()
    this.colliders = []
    this.group.position.set(...position)
    this.group.rotation.y = rotationY
    this.group.scale.set(...scale)
    this.ready = this._load(modelPath)
  }

  async _load(modelPath) {
    const gltf = await loader.loadAsync(modelPath)
    const root = gltf.scene
    root.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())

    // Center the asset on its group. Position, rotation and scale remain
    // explicit scene settings rather than automatic deformation.
    root.position.set(-center.x, -center.y, -center.z)
    this.group.add(root)
    this.group.updateMatrixWorld(true)

    root.traverse(object => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { material.side = THREE.DoubleSide })
      this.colliders.push(object)
    })
  }

  dispose() {
    this.group.removeFromParent()
  }
}
