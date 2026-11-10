import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import fontData from './fonts/mimix-space-display.js'
import { THEME } from '../config/theme.js'
import { CHARACTER_SPACE_STYLE } from '../config/character-space-style.js'

const RIM_GLOW_SCALE = 0.16

// Generated once, then animated in the existing world loop. No extra canvas,
// font request or lighting pass. Lit materials share the character's space
// finish and existing lights; a little emission keeps the yellow readable.
export class SpaceWordmark {
  constructor({ scene, camera, anchor, canvas, layout = {} }) {
    this.layout = layout
    this.camera = camera
    this.anchor = anchor.clone()
    this.canvas = canvas
    this.elapsed = 0
    this.weight = 1
    this.disposed = false
    this.pointer = new THREE.Vector2()
    this.pointerActive = false
    this.projected = new THREE.Vector3()
    this.tilt = new THREE.Vector2()
    this.up = new THREE.Vector3()
    this.group = new THREE.Group()
    this.group.name = 'MimixSpaceWordmark'
    const surface = {
      roughness: CHARACTER_SPACE_STYLE.materials.maxRoughness,
      specularIntensity: CHARACTER_SPACE_STYLE.materials.minSpecularIntensity,
      metalness: 0,
      toneMapped: false,
      transparent: true,
    }
    this.materials = [
      new THREE.MeshPhysicalMaterial({ ...surface, color: THEME.brand.yellow, emissive: THEME.brand.yellow, emissiveIntensity: 0.35 }),
      new THREE.MeshPhysicalMaterial({ ...surface, color: THEME.brand.yellowDark }),
    ]
    this.rimColor = { value: new THREE.Color(CHARACTER_SPACE_STYLE.rim.color) }
    this.rimGlow = { value: CHARACTER_SPACE_STYLE.rim.intensity * RIM_GLOW_SCALE }
    for (const material of this.materials) {
      // Yellow paint absorbs blue diffuse light. A bounded grazing highlight
      // keeps the shared cold rim visible on the bevels without recoloring faces.
      material.onBeforeCompile = shader => {
        shader.uniforms.spaceRimColor = this.rimColor
        shader.uniforms.spaceRimStrength = this.rimGlow
        shader.fragmentShader = 'uniform vec3 spaceRimColor;\nuniform float spaceRimStrength;\n' + shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float spaceFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += spaceRimColor * spaceRimStrength * spaceFresnel;`,
        )
      }
      material.customProgramCacheKey = () => 'mimix-space-wordmark-rim-v1'
    }
    const font = new FontLoader().parse(fontData)
    this.geometries = new Map()
    let cursor = 0
    for (const [i, char] of [...'MIMIX'].entries()) {
      if (!this.geometries.has(char)) {
        const geometry = new TextGeometry(char, { font, size: 1, depth: 0.16, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 })
        geometry.computeBoundingBox()
        const center = geometry.boundingBox.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)
        geometry.computeBoundingBox()
        this.geometries.set(char, geometry)
      }
      const geometry = this.geometries.get(char)
      const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x
      const letter = new THREE.Mesh(geometry, this.materials)
      letter.name = `${char}-${i + 1}`
      letter.position.x = cursor + width / 2
      cursor += width + 0.1
      this.group.add(letter)
    }
    this.width = cursor - 0.1
    this.height = Math.max(...[...this.geometries.values()].map(geometry => geometry.boundingBox.max.y - geometry.boundingBox.min.y))
    for (const letter of this.group.children) letter.position.x -= this.width / 2
    scene.add(this.group)
    this.onPointerMove = event => {
      this.pointerActive = true
      const bounds = canvas.getBoundingClientRect()
      this.pointer.set(
        THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1),
      )
    }
    this.onPointerLeave = () => { this.pointerActive = false; this.pointer.set(0, 0) }
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.update(0)
  }

  setTransitionProgress(progress) {
    this.weight = 1 - THREE.MathUtils.smoothstep(progress, 0, 0.55)
    this.group.visible = this.weight > 0
    for (const material of this.materials) material.opacity = this.weight
  }

  update(delta, reducedMotion = false, warp = 0) {
    if (this.disposed) return
    const pulse = reducedMotion ? 0 : THREE.MathUtils.clamp(warp, 0, 1)
    this.rimGlow.value = (CHARACTER_SPACE_STYLE.rim.intensity + pulse * CHARACTER_SPACE_STYLE.rim.warpBoost) * RIM_GLOW_SCALE * this.weight
    const hidden = globalThis.document?.hidden ?? false
    if (!reducedMotion && !hidden) this.elapsed += delta
    if (reducedMotion) this.tilt.set(0, 0)
    else if (!hidden) this.tilt.lerp(this.pointer, 1 - Math.exp(-delta * 5))
    const distance = this.camera.position.distanceTo(this.anchor)
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const scale = Math.min(viewHeight * (this.layout.heightRatio ?? 0.14) / this.height, viewHeight * this.camera.aspect * (this.layout.widthRatio ?? 0.54) / this.width)
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    this.group.position.copy(this.anchor).addScaledVector(this.up, viewHeight * (this.layout.offsetRatio ?? 0.33))
    this.group.scale.setScalar(scale * (0.95 + this.weight * 0.05))
    this.group.quaternion.copy(this.camera.quaternion)
    this.group.rotateX(-this.tilt.y * 0.08)
    this.group.rotateY(this.tilt.x * 0.14)
    this.group.updateMatrixWorld(true)
    for (const [i, letter] of this.group.children.entries()) {
      const phase = i * 0.85
      letter.getWorldPosition(this.projected).project(this.camera)
      const dx = (this.projected.x - this.pointer.x) * this.camera.aspect
      const dy = this.projected.y + this.pointer.y
      const target = this.pointerActive && !reducedMotion ? Math.max(0, 1 - Math.hypot(dx, dy) / 0.3) : 0
      const previous = letter.userData.hover ?? 0
      const hover = reducedMotion ? 0 : THREE.MathUtils.lerp(previous, target, 1 - Math.exp(-delta * 12))
      letter.userData.hover = hover
      letter.scale.setScalar(1 + hover * 0.12)
      letter.position.y = reducedMotion ? 0 : Math.sin(this.elapsed * 0.85 + phase) * 0.06 + hover * 0.2
      letter.rotation.set(
        -hover * 0.22,
        0.1 + (reducedMotion ? 0 : Math.sin(this.elapsed * 0.55 + phase) * 0.1 + hover * 0.3),
        reducedMotion ? 0 : Math.sin(this.elapsed * 0.7 + phase) * 0.025 + hover * (i % 2 ? -0.12 : 0.12),
      )
      letter.updateMatrix()
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.group.removeFromParent()
    for (const geometry of this.geometries.values()) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.group.clear()
    this.geometries.clear()
    this.materials.length = 0
  }
}
