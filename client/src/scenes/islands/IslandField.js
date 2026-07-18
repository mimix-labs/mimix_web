import * as THREE from 'three'
import { THEME } from '../../config/theme.js'
import { VoxelIsland } from './VoxelIsland.js'
import { Bridge } from './Bridge.js'

const RING_RADIUS   = 34  // distancia del centro a cada isla STEAM
const HOME_RADIUS   = 9   // HOME es la más grande (base del mentor)
const ISLAND_RADIUS = 6

// Monta el archipiélago completo: HOME al centro + 5 islas STEAM en
// círculo, unidas por puentes. Colores y nombres salen de theme.js.
export class IslandField {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.parts = []   // todo lo creado, para dispose()

    this._buildHome()
    this._buildSteamIslands()

    this.scene.add(this.group)
  }

  // Isla central grande, neón cian neutro (aquí va Wall-E)
  _buildHome() {
    const home = new VoxelIsland(this.group, {
      position: [0, 0, 0],
      color:    0x6fe9ff,
      radius:   HOME_RADIUS,
      depth:    11,
    })
    this.parts.push(home)
  }

  // Las 5 disciplinas repartidas en círculo, cada una con su puente
  _buildSteamIslands() {
    const islands = Object.values(THEME.islands)
    const step = (Math.PI * 2) / islands.length

    islands.forEach((data, i) => {
      const angle = -Math.PI / 2 + i * step  // arranca arriba, gira en círculo
      const ux = Math.cos(angle), uz = Math.sin(angle)
      const x = ux * RING_RADIUS
      const z = uz * RING_RADIUS

      // La isla
      const island = new VoxelIsland(this.group, {
        position: [x, 0, z],
        color:    data.accent,
        radius:   ISLAND_RADIUS,
        depth:    8,
        beacon:   true,   // faro = futura estación de reto
      })
      this.parts.push(island)

      // El puente: del borde de HOME al borde de la isla
      const from = { x: ux * (HOME_RADIUS - 1),               z: uz * (HOME_RADIUS - 1) }
      const to   = { x: ux * (RING_RADIUS - ISLAND_RADIUS + 1), z: uz * (RING_RADIUS - ISLAND_RADIUS + 1) }
      const bridge = new Bridge(from, to, { color: data.accent, width: 3 })
      this.group.add(bridge.group)
      this.parts.push(bridge)
    })
  }

  dispose() {
    this.parts.forEach(p => p.dispose())
    this.scene.remove(this.group)
  }
}
