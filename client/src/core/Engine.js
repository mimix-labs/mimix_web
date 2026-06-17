import * as THREE from 'three'

export class Engine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, 30, 100)

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.2)
    sun.position.set(10, 20, 10)
    this.scene.add(sun)
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
