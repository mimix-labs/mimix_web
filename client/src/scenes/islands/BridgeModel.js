import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(draco)

// Places one bridge GLB between two island edges. The source asset is centered
// and authored along local X; only that axis is stretched to fit the route.
export class BridgeModel {
  constructor(from, to, { modelPath } = {}) {
    this.group = new THREE.Group()
    this.colliders = []
    this.ready = this._load(from, to, modelPath)
  }

  async _load(from, to, modelPath) {
    const gltf = await loader.loadAsync(modelPath)
    const root = gltf.scene
    root.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const length = Math.hypot(to.x - from.x, to.z - from.z)

    // Normalize its pivot before placing and scaling the model in world space.
    root.position.set(-center.x, 0, -center.z)
    root.scale.x = length / size.x
    this.group.position.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2)
    this.group.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x)
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
