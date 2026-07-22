import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { THEME } from "../config/theme.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

export class Engine {
  // Crea la escena
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEME.sky);

    this._setupRenderer();
    this._setupCamera();
    this._setupControls();
    this._setupLights();
    this._setupResize();
    this._setupPostProcessing();
  }

  // Genera el mundo 3D a píxeles
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; //baked lighting - no real-time shadows
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  // Crea la cámara
  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    this.camera.position.set(6, 7, 6); // bien cerca de Wall-E, picado ~40° (estilo Bruno), mirando al origen
  }

  // Configura los controles
  _setupControls() {
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.enableRotate = false; // sin rotación: solo paneo con clic izquierdo
    this.controls.target.set(0, 0, 0); // la cámara mira al origen (Wall-E + mapa centrados)
    this.controls.minDistance = 6; // zoom máximo (lo más cerca)
    this.controls.maxDistance = 16; // zoom mínimo: rango CORTO = mapa "vivo" como Bruno
  }

  // Monta las luces
  _setupLights() {
    // Soft fill - prevents pure black shadows on dark sky
    const ambient = new THREE.AmbientLight(0x334466, 0.8);
    this.scene.add(ambient);

    // Main warm-gold key light (reinforces yellow brand)
    const key = new THREE.DirectionalLight(0xffe680, 2.0);
    key.position.set(15, 30, 10);
    this.scene.add(key);

    // Subtle cool rim light from below (floating island atmosphere)
    const rim = new THREE.DirectionalLight(0x4466aa, 0.4);
    rim.position.set(-10, -10, -10);
    this.scene.add(rim);
  }

  // Escucha el evento {resize} de la venta y reajusta cámara y renderer
  _setupResize() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom desactivado — render plano sin brillo
  }

  /* Es lo que llamarías dentro de tu bucle de animación (con
  {requestAnimationFrame}): actualiza controles y dibuja un frame
  */
  render() {
    this.controls.update(); // required every frame for damping
    this.composer.render();
  }
}
