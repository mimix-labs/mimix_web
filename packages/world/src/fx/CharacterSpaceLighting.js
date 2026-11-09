import * as THREE from 'three'
import { CHARACTER_SPACE_STYLE } from '../config/character-space-style.js'

const { front: frontStyle, rim: rimStyle, materials: materialStyle } = CHARACTER_SPACE_STYLE

// Temporary lighting for the active character's space preview. The authored
// palette/textures stay intact and the exact map materials return after Play.
export class CharacterSpaceLighting {
  constructor({ scene, character, camera, front, rim }) {
    this.character = character
    this.camera = camera
    this.weight = 1
    this.disposed = false
    this.rig = new THREE.Group()
    this.rig.name = 'CharacterSpaceLighting'
    this.target = new THREE.Object3D()
    this.front = front
    this.rim = rim
    // Keep the light count stable: changing it recompiles every lit shader
    // just as the full terrain appears. Restore the authored lights exactly.
    this.lights = [front, rim].map(light => ({ light, intensity: light.intensity, color: light.color.clone(), position: light.position.clone(), target: light.target }))
    this.frontColor = new THREE.Color(frontStyle.color)
    this.rimColor = new THREE.Color(rimStyle.color)
    this.mapTarget = front.target.getWorldPosition(new THREE.Vector3())
    this.center = new THREE.Vector3()
    this.frontPosition = new THREE.Vector3()
    this.rimPosition = new THREE.Vector3()
    this.rig.add(this.target)
    scene.add(this.rig)

    const center = new THREE.Box3().setFromObject(character).getCenter(new THREE.Vector3())
    this.localCenter = character.worldToLocal(center)
    this.view = new THREE.Vector3()
    this.right = new THREE.Vector3()
    this.up = new THREE.Vector3(0, 1, 0)
    this.originals = []
    this.materials = new Map()
    const previewMaterial = original => {
      if (!original?.isMeshStandardMaterial) return original
      if (!this.materials.has(original)) {
        const copy = original.clone()
        copy.roughness = Math.min(original.roughness, materialStyle.maxRoughness)
        if ('specularIntensity' in copy) copy.specularIntensity = Math.max(original.specularIntensity, materialStyle.minSpecularIntensity)
        this.materials.set(original, copy)
      }
      return this.materials.get(original)
    }
    character.traverse(mesh => {
      if (!mesh.isMesh) return
      this.originals.push({ mesh, material: mesh.material })
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(previewMaterial) : previewMaterial(mesh.material)
    })
    this.update(0)
  }

  setTransitionProgress(progress) {
    this.weight = 1 - THREE.MathUtils.smoothstep(progress, 0, 1)
  }

  update(warp = 0, reducedMotion = false) {
    if (this.disposed) return
    const pulse = reducedMotion ? 0 : THREE.MathUtils.clamp(warp, 0, 1)
    this.character.updateWorldMatrix(true, false)
    this.center.copy(this.localCenter).applyMatrix4(this.character.matrixWorld)
    this.target.position.lerpVectors(this.mapTarget, this.center, this.weight)
    this.view.copy(this.camera.position).sub(this.center).normalize()
    this.right.crossVectors(this.up, this.view).normalize()
    this.frontPosition.copy(this.center).addScaledVector(this.view, frontStyle.offset.view).addScaledVector(this.up, frontStyle.offset.up).addScaledVector(this.right, frontStyle.offset.right)
    this.rimPosition.copy(this.center).addScaledVector(this.view, rimStyle.offset.view).addScaledVector(this.right, rimStyle.offset.right).addScaledVector(this.up, rimStyle.offset.up)
    this.front.position.lerpVectors(this.lights[0].position, this.frontPosition, this.weight)
    this.rim.position.lerpVectors(this.lights[1].position, this.rimPosition, this.weight)
    this.front.intensity = THREE.MathUtils.lerp(this.lights[0].intensity, frontStyle.intensity + pulse * frontStyle.warpBoost, this.weight)
    this.rim.intensity = THREE.MathUtils.lerp(this.lights[1].intensity, rimStyle.intensity + pulse * rimStyle.warpBoost, this.weight)
    this.front.color.copy(this.lights[0].color).lerp(this.frontColor, this.weight)
    this.rim.color.copy(this.lights[1].color).lerp(this.rimColor, this.weight)
    this.front.target = this.target
    this.rim.target = this.target
    if (this.weight === 0) this._restoreLights()
    for (const [original, copy] of this.materials) {
      copy.roughness = THREE.MathUtils.lerp(original.roughness, Math.min(original.roughness, materialStyle.maxRoughness), this.weight)
      if ('specularIntensity' in copy) copy.specularIntensity = THREE.MathUtils.lerp(original.specularIntensity, Math.max(original.specularIntensity, materialStyle.minSpecularIntensity), this.weight)
    }
  }

  _restoreLights() {
    for (const { light, intensity, color, position, target } of this.lights) {
      light.intensity = intensity
      light.color.copy(color)
      light.position.copy(position)
      light.target = target
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this._restoreLights()
    for (const { mesh, material } of this.originals) mesh.material = material
    for (const copy of this.materials.values()) copy.dispose()
    this.materials.clear()
    this.originals.length = 0
    this.rig.removeFromParent()
  }
}
