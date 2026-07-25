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
    this.walkwayHalfLength = 0
    this.walkwayHalfWidth = 0
    this.localPoint = new THREE.Vector3()
    this.worldPoint = new THREE.Vector3()
    this.deckRaycaster = new THREE.Raycaster()
    this.down = new THREE.Vector3(0, -1, 0)
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
    const size = box.getSize(new THREE.Vector3())

    // Center the asset on its group. Position, rotation and scale remain
    // explicit scene settings rather than automatic deformation.
    root.position.set(-center.x, -center.y, -center.z)
    // Use the wooden deck as the only bridge navigation surface. The previous
    // corridor was too narrow at the curved entries, so Wall-E could reach the
    // visible planks but still be rejected by navigation. Keep a small margin
    // before the rail posts while covering the usable board width.
    this.walkwayHalfLength = size.x * 0.49
    this.walkwayHalfWidth = size.z * 0.42
    this.group.add(root)
    this.group.updateMatrixWorld(true)

    root.traverse(object => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { material.side = THREE.DoubleSide })
      this.colliders.push(object)
    })
  }

  getWalkwayHeightAt(x, z) {
    if (!this.walkwayHalfLength || !this.walkwayHalfWidth) return null

    this.worldPoint.set(x, 0, z)
    this.localPoint.copy(this.worldPoint)
    this.group.worldToLocal(this.localPoint)
    if (
      Math.abs(this.localPoint.x) > this.walkwayHalfLength ||
      Math.abs(this.localPoint.z) > this.walkwayHalfWidth
    ) return null

    // Raycast the actual deck geometry at this point. The authored model's
    // deck is not necessarily at the group's Y origin.
    this.worldPoint.set(x, 100, z)
    this.deckRaycaster.set(this.worldPoint, this.down)
    const hit = this.deckRaycaster.intersectObjects(this.colliders, true)[0]
    return hit ? hit.point.y : null
  }

  dispose() {
    this.group.removeFromParent()
  }
}
