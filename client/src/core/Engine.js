import * as THREE from 'three'
import { THEME } from '../config/theme.js'

export class Engine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(THEME.sky)
    this.scene.fog = new THREE.Fog(THEME.fog, 40, 120)

    this._setupRenderer()
    this._setupCamera()
    this._setupLights()
    this._setupResize()
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = false // baked lighting — no real-time shadows
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    )
    this.camera.position.set(0, 8, 16)
    this.camera.lookAt(0, 0, 0)
  }

  _setupLights() {
    // Soft fill — prevents pure black shadows on dark sky
    const ambient = new THREE.AmbientLight(0x334466, 0.8)
    this.scene.add(ambient)

    // Main warm-gold key light (reinforces yellow brand)
    const key = new THREE.DirectionalLight(0xFFE680, 2.0)
    key.position.set(15, 30, 10)
    this.scene.add(key)

    // Subtle cool rim light from below (floating island atmosphere)
    const rim = new THREE.DirectionalLight(0x4466AA, 0.4)
    rim.position.set(-10, -10, -10)
    this.scene.add(rim)
  }

  _setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    })
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }
}
