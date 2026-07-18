import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(draco)

// Carga un GLB de isla SOLO para medir cuánto espacio ocupa en el plano.
// Lo añade a la escena, dibuja su bounding box y vuelca las dimensiones
// (ancho × alto × profundidad, en unidades del mundo) a la consola.
export class IslandModel {
  constructor(scene, modelPath, { position = [0, 0, 0] } = {}) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.position.set(...position)
    this.scene.add(this.group)

    this._load(modelPath)
  }

  async _load(modelPath) {
    const gltf = await loader.loadAsync(modelPath)
    const root = gltf.scene
    this.group.add(root)

    // Medir la caja envolvente del modelo ya cargado
    const box  = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const ctr  = box.getCenter(new THREE.Vector3())

    console.log(
      `[IslandModel] ${modelPath}\n` +
      `  Ancho  (X): ${size.x.toFixed(2)} u\n` +
      `  Alto   (Y): ${size.y.toFixed(2)} u\n` +
      `  Fondo  (Z): ${size.z.toFixed(2)} u\n` +
      `  Centro: (${ctr.x.toFixed(2)}, ${ctr.y.toFixed(2)}, ${ctr.z.toFixed(2)})`
    )

    // Caja amarilla de referencia para ver el volumen que ocupa
    const helper = new THREE.Box3Helper(box, 0xF5C400)
    this.scene.add(helper)
    this.helper = helper
  }

  dispose() {
    if (this.helper) this.scene.remove(this.helper)
    this.scene.remove(this.group)
  }
}
