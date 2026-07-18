import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { IslandModel } from './islands/IslandModel.js'

export class SteamMap {
  constructor(scene) {
    this.scene = scene
    this._build()
  }

  _build() {
    // Rejilla de referencia: 10×10 unidades (cada celda = 1 unidad)
    const grid = new THREE.GridHelper(10, 10, 0x333344, 0x333344)
    this.scene.add(grid)

    // Isla GLB de prueba — solo para medir cuánto ocupa en el plano.
    // Coloca el archivo en: client/public/assets/models/islands/island-1.glb
    this.island = new IslandModel(this.scene, '/assets/models/islands/island-1.glb', {
      position: [0, 0, 0],
    })
  }

  update(_delta, _elapsed) {}
}