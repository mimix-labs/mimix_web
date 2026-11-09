import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { galaxyFragmentShader } from './reactbits/galaxy-shader.js'

// Values supplied by the user from React Bits' Classic / Hue Shift preset.
const SETTINGS = Object.freeze({
  hueShift: 140, saturation: 0.36, density: 1,
  glowIntensity: 0.18, starSize: 1, flareIntensity: 1, twinkleIntensity: 0.3,
  starSpeed: 0.5, speed: 1, rotationSpeed: 0.1,
  layers: 4, direction: 'forward', repulsionStrength: 2,
  mouseInteraction: true, mouseRepulsion: true, clickWarp: true,
  intro: true, transparent: true, lightMode: false, opacity: 1,
})
const STAR_GLOW = 0.05 * SETTINGS.glowIntensity * SETTINGS.starSize
const INTRO_SECONDS = 2.2

// React Bits Galaxy's actual star shader, drawn behind the world in its renderer.
// The original's flight, cursor repulsion and click warp share our existing loop.
export class GalaxyBackground {
  constructor(scene, {
    renderer,
    canvas = renderer?.domElement,
    motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
    document = globalThis.document,
    intro = SETTINGS.intro,
  } = {}) {
    this.renderer = renderer
    this.canvas = canvas
    this.motionQuery = motionQuery
    this.document = document
    this.reducedMotion = motionQuery?.matches ?? false
    this.interactive = false
    this.disposed = false
    this.boost = 0
    this.transitionBoost = 0
    this.reveal = intro && !this.reducedMotion ? 0 : 1
    this.pointer = { position: new THREE.Vector2(0.5, 0.5), inside: false }
    const uniforms = {
      uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) },
      uFocal: { value: new THREE.Vector2(0.5, 0.5) }, uRotation: { value: new THREE.Vector2(1, 0) },
      uGloss: { value: 0 }, uDepth: { value: 0 }, uDensity: { value: SETTINGS.density },
      uHueShift: { value: SETTINGS.hueShift }, uSpeed: { value: SETTINGS.speed }, uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uStarGlow: { value: STAR_GLOW }, uFlareGain: { value: SETTINGS.glowIntensity * SETTINGS.flareIntensity }, uSquash: { value: 0 },
      uSaturation: { value: SETTINGS.saturation }, uMouseRepulsion: { value: Number(SETTINGS.mouseRepulsion) }, uTwinkleIntensity: { value: SETTINGS.twinkleIntensity },
      uRotationAngle: { value: 0 }, uRepulsionStrength: { value: SETTINGS.repulsionStrength }, uMouseActiveFactor: { value: 0 },
      uAutoCenterRepulsion: { value: 0 }, uLayers: { value: SETTINGS.layers },
      uColors: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] },
      uColorCount: { value: 0 }, uWarp: { value: 0 }, uReveal: { value: this.reveal },
      uMode: { value: SETTINGS.lightMode ? (SETTINGS.transparent ? 3 : 2) : (SETTINGS.transparent ? 1 : 0) }, uBackground: { value: new THREE.Color(THEME.sky).convertLinearToSRGB() },
      uOpacity: { value: SETTINGS.opacity },
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    const material = new THREE.RawShaderMaterial({
      uniforms,
      glslVersion: THREE.GLSL3,
      defines: { REPEL: 1, WARP: 1 },
      vertexShader: 'in vec3 position; void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
      fragmentShader: galaxyFragmentShader,
      depthTest: true, depthWrite: false, toneMapped: false,
      transparent: SETTINGS.transparent, premultipliedAlpha: true,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.name = 'GalaxyBackground'
    this.mesh.userData.worldBackground = true
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    // Composer targets can have a different size than the canvas after resize.
    this.mesh.onBeforeRender = activeRenderer => {
      const target = activeRenderer.getRenderTarget()
      if (target) uniforms.uResolution.value.set(target.width, target.height)
      else activeRenderer.getDrawingBufferSize(uniforms.uResolution.value)
    }
    scene.add(this.mesh)

    this.onMove = event => {
      if (!this.interactive || !SETTINGS.mouseInteraction || this.reducedMotion) return
      const rect = canvas.getBoundingClientRect()
      this.pointer.position.set((event.clientX - rect.left) / Math.max(rect.width, 1), 1 - (event.clientY - rect.top) / Math.max(rect.height, 1))
      this.pointer.inside = true
    }
    this.onDown = event => {
      if (event.button !== 0 || !this.interactive || !SETTINGS.clickWarp || this.reducedMotion || this.document?.hidden) return
      this.onMove(event)
      this.boost = Math.min(1.6, this.boost + 1)
    }
    this.onLeave = () => { this.pointer.inside = false }
    canvas?.addEventListener('pointermove', this.onMove)
    canvas?.addEventListener('pointerdown', this.onDown)
    canvas?.addEventListener('pointerleave', this.onLeave)
    this.onMotionChange = () => {
      this.reducedMotion = motionQuery.matches
      if (this.reducedMotion) this._resetInteraction()
    }
    motionQuery?.addEventListener('change', this.onMotionChange)
  }

  setInteractive(enabled) {
    this.interactive = enabled
    if (!enabled) this._resetInteraction()
  }

  get warpIntensity() { return this.mesh.material.uniforms.uWarp.value }

  _resetInteraction() {
    this.pointer.inside = false
    this.boost = 0
    this.transitionBoost = 0
    this.reveal = 1
    this.mesh.material.uniforms.uReveal.value = 1
    this.mesh.material.uniforms.uMouseActiveFactor.value = 0
    this._syncWarp()
  }

  _syncWarp() {
    const uniforms = this.mesh.material.uniforms
    const warp = this.reducedMotion ? 0 : Math.max(this.boost, this.transitionBoost)
    const stretch = 1 + warp * 5
    uniforms.uWarp.value = warp
    uniforms.uSquash.value = 1 - 1 / (stretch * stretch)
    uniforms.uStarGlow.value = STAR_GLOW / stretch ** 0.6
  }

  update(delta, travelSpeed = 1) {
    if (this.disposed) return
    const uniforms = this.mesh.material.uniforms
    this.renderer?.getDrawingBufferSize(uniforms.uResolution.value)
    if (this.reducedMotion || this.document?.hidden) return
    const dt = Math.min(delta, 0.05)
    // Scale travel after the frame clamp; keep twinkle, glow and pointer timing stable.
    const travelDt = dt * (Number.isFinite(travelSpeed) ? Math.max(0, travelSpeed) : 1)
    if (this.reveal < 1) {
      this.reveal = Math.min(1, this.reveal + dt / INTRO_SECONDS)
      this.boost = Math.max(this.boost, (1 - this.reveal) ** 2 * 1.4)
      const fade = Math.min(1, this.reveal / 0.35)
      uniforms.uReveal.value = fade * fade * (3 - 2 * fade)
    }
    this.boost *= Math.exp(-dt * 1.3)
    if (this.boost < 0.001) this.boost = 0
    this._syncWarp()
    uniforms.uTime.value += dt
    const flight = SETTINGS.starSpeed / 10 * (SETTINGS.direction === 'backward' ? -1 : 1)
    uniforms.uGloss.value += travelDt * flight
    uniforms.uDepth.value += travelDt * flight * SETTINGS.speed * (1 + uniforms.uWarp.value * 14)
    uniforms.uRotationAngle.value += dt * SETTINGS.rotationSpeed
    const follow = 1 - Math.exp(-dt / 0.325)
    const engaged = this.interactive && SETTINGS.mouseInteraction && this.pointer.inside
    if (engaged) uniforms.uMouse.value.lerp(this.pointer.position, follow)
    uniforms.uMouseActiveFactor.value = THREE.MathUtils.lerp(uniforms.uMouseActiveFactor.value, engaged ? 1 : 0, follow)
  }

  setTransitionProgress(progress) {
    if (this.disposed) return
    this.transitionBoost = progress <= 0 || progress >= 1 ? 0 : Math.sin(progress * Math.PI)
    this._syncWarp()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.canvas?.removeEventListener('pointermove', this.onMove)
    this.canvas?.removeEventListener('pointerdown', this.onDown)
    this.canvas?.removeEventListener('pointerleave', this.onLeave)
    this.motionQuery?.removeEventListener('change', this.onMotionChange)
    this._resetInteraction()
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
