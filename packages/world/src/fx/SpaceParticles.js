import * as THREE from 'three'
import { THEME } from '../config/theme.js'

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uWarp;
  attribute vec4 aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vRadial;

  void main() {
    vec3 drift = vec3(
      sin(uTime * mix(0.3, 0.55, aSeed.w) + aSeed.x * 6.283),
      sin(uTime * mix(0.25, 0.42, aSeed.x) + aSeed.y * 6.283),
      cos(uTime * mix(0.28, 0.5, aSeed.y) + aSeed.z * 6.283)
    ) * 6.0;
    vec4 viewPosition = modelViewMatrix * vec4(position * (1.0 - uWarp * 0.1) + drift, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float depthScale = clamp(180.0 / max(-viewPosition.z, 1.0), 0.5, 1.5);
    gl_PointSize = uSize * uPixelRatio * mix(0.55, 1.35, aSeed.z) * depthScale;
    gl_PointSize *= 1.0 + uWarp * 2.5;
    vRadial = normalize(vec2(gl_Position.x, -gl_Position.y) + vec2(0.0001));
    vColor = aColor;
    float shimmer = 0.82 + 0.18 * sin(uTime * 1.4 + aSeed.x * 6.283);
    vOpacity = mix(0.72, 1.0, aSeed.w) * shimmer;
  }
`

const FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uWarp;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vRadial;

  void main() {
    vec2 local = gl_PointCoord - vec2(0.5);
    float along = dot(local, vRadial);
    float radius = length((local - vRadial * along) * (1.0 + uWarp * 2.5) + vRadial * along);
    float glow = exp(-radius * radius * 10.0);
    float edge = 1.0 - smoothstep(0.3, 0.5, radius);
    float alpha = glow * edge * vOpacity * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`

// A distant field inspired by React Bits Particles. It shares the world's
// renderer, camera and depth buffer, so the islands naturally occlude it.
export class SpaceParticles {
  constructor(scene, {
    renderer,
    count = 2800,
    size = 5.2,
    opacity = 0.9,
    speed = 0.9,
    motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
    document = globalThis.document,
  } = {}) {
    this.renderer = renderer
    this.document = document
    this.speed = speed
    this.motionQuery = motionQuery
    this.reducedMotion = motionQuery?.matches ?? false
    this.disposed = false

    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    const colors = new Float32Array(count * 3)
    const palette = [
      new THREE.Color(0xe8edf5),
      new THREE.Color(0xe8edf5),
      new THREE.Color(0xe8edf5).lerp(new THREE.Color(THEME.islands.science.accent), 0.25),
      new THREE.Color(0xe8edf5).lerp(new THREE.Color(THEME.brand.yellow), 0.2),
    ]
    // Stable layout across remounts; no resources or textures to download.
    let seed = 1201
    const next = () => {
      seed = (1664525 * seed + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let index = 0; index < count; index++) {
      const vertical = next() * 2 - 1
      const angle = next() * Math.PI * 2
      const radius = 160 + next() * 60
      const horizontal = Math.sqrt(1 - vertical * vertical)
      positions[index * 3] = radius * horizontal * Math.cos(angle)
      positions[index * 3 + 1] = radius * vertical
      positions[index * 3 + 2] = radius * horizontal * Math.sin(angle)
      for (let component = 0; component < 4; component++) seeds[index * 4 + component] = next()
      palette[Math.floor(next() * palette.length)].toArray(colors, index * 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()
    // Account for the shader drift when culling at the edge of the viewport.
    geometry.boundingSphere.radius += 12
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
        uSize: { value: size },
        uOpacity: { value: opacity },
        uWarp: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.points = new THREE.Points(geometry, material)
    this.points.name = 'SpaceParticles'
    this.points.position.set(20, 0, -20)
    scene.add(this.points)

    this.onMotionChange = () => {
      this.reducedMotion = this.motionQuery.matches
      if (this.reducedMotion) this.points.material.uniforms.uWarp.value = 0
    }
    motionQuery?.addEventListener('change', this.onMotionChange)
  }

  update(delta) {
    if (this.disposed) return
    const uniforms = this.points.material.uniforms
    uniforms.uPixelRatio.value = this.renderer?.getPixelRatio() ?? 1
    if (this.reducedMotion || this.document?.hidden) return
    // Use active delta, not the world's elapsed time, to resume without jumps.
    uniforms.uTime.value += Math.min(delta, 0.05) * this.speed * (1 + uniforms.uWarp.value * 2)
    this.points.rotation.y = uniforms.uTime.value * 0.009
  }

  setTransitionProgress(progress) {
    if (this.disposed) return
    this.points.material.uniforms.uWarp.value = this.reducedMotion || progress <= 0 || progress >= 1
      ? 0 : Math.sin(progress * Math.PI) * 0.65
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.motionQuery?.removeEventListener('change', this.onMotionChange)
    this.points.removeFromParent()
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}
