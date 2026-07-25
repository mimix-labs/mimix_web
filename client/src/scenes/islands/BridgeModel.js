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
    this.deckProfile = null
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
    // Navigation uses a continuous surface following the wooden deck. Using
    // the GLB triangles directly creates invisible gaps between planks and
    // lets rail pieces interrupt movement.
    this.walkwayHalfLength = size.x * 0.52
    this.walkwayHalfWidth = size.z * 0.50
    this.group.add(root)
    this.group.updateMatrixWorld(true)

    root.traverse(object => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { material.side = THREE.DoubleSide })
      this.colliders.push(object)
    })

    this.deckProfile = this._createDeckProfile()
  }

  getWalkwayHeightAt(x, z) {
    if (!this.walkwayHalfLength || !this.walkwayHalfWidth || !this.deckProfile) return null

    this.worldPoint.set(x, 0, z)
    this.localPoint.copy(this.worldPoint)
    this.group.worldToLocal(this.localPoint)
    if (
      Math.abs(this.localPoint.x) > this.walkwayHalfLength ||
      Math.abs(this.localPoint.z) > this.walkwayHalfWidth
    ) return null

    this.localPoint.set(
      this.localPoint.x,
      this._getDeckProfileHeight(this.localPoint.x),
      this.localPoint.z,
    )
    this.group.localToWorld(this.localPoint)
    return this.localPoint.y
  }

  _createDeckProfile() {
    const sampleXs = [
      -this.walkwayHalfLength * 0.82,
      0,
      this.walkwayHalfLength * 0.82,
    ]
    const heights = sampleXs.map(x => this._sampleDeckHeight(x))
    const fallbackHeight = heights.find(height => height !== null) ?? 0

    return sampleXs.map((x, index) => ({
      x,
      y: heights[index] ?? fallbackHeight,
    }))
  }

  _sampleDeckHeight(localX) {
    this.localPoint.set(localX, 0, 0)
    this.group.localToWorld(this.localPoint)
    this.worldPoint.set(this.localPoint.x, 100, this.localPoint.z)
    this.deckRaycaster.set(this.worldPoint, this.down)

    const hit = this.deckRaycaster.intersectObjects(this.colliders, true)
      .find(candidate => {
        if (!candidate.face) return false
        const normal = candidate.face.normal.clone()
          .transformDirection(candidate.object.matrixWorld)
        return Math.abs(normal.y) > 0.6
      })
    if (!hit) return null

    this.localPoint.copy(hit.point)
    this.group.worldToLocal(this.localPoint)
    return this.localPoint.y
  }

  _getDeckProfileHeight(localX) {
    const [start, center, end] = this.deckProfile
    if (localX <= center.x) {
      const progress = THREE.MathUtils.clamp(
        (localX - start.x) / (center.x - start.x),
        0,
        1,
      )
      return THREE.MathUtils.lerp(start.y, center.y, progress)
    }

    const progress = THREE.MathUtils.clamp(
      (localX - center.x) / (end.x - center.x),
      0,
      1,
    )
    return THREE.MathUtils.lerp(center.y, end.y, progress)
  }

  dispose() {
    this.group.removeFromParent()
  }
}
