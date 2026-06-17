import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { BaseIsland, BS } from './islands/BaseIsland.js'

const ISLAND_DEFS = [
  { id: 'math',        style: 'hub',      radius: 8, maxDepth: 5 },
  { id: 'science',     style: 'dome',     radius: 6, maxDepth: 3 },
  { id: 'technology',  style: 'grid',     radius: 6, maxDepth: 3 },
  { id: 'engineering', style: 'terraced', radius: 6, maxDepth: 3 },
  { id: 'art',         style: 'organic',  radius: 6, maxDepth: 3 },
]

export class SteamMap {
  constructor(scene) {
    this.scene   = scene
    this.islands = []
    this._build()
  }

  _build() {
    const allTop    = []
    const allBody   = []
    // accent blocks grouped by color hex
    const accentMap = {}

    for (const def of ISLAND_DEFS) {
      const cfg      = THEME.islands[def.id]
      const island   = new BaseIsland({ id: def.id, position: cfg.pos, ...def })
      this.islands.push(island)

      allTop.push(...island.topBlocks)
      allBody.push(...island.bodyBlocks)

      const hex = cfg.accent
      if (!accentMap[hex]) accentMap[hex] = []
      accentMap[hex].push(...island.accentBlocks)
    }

    // Single InstancedMesh per color — minimal draw calls
    this._instanced(allTop,  THEME.brand.yellow)
    this._instanced(allBody, THEME.brand.black)

    for (const [hex, blocks] of Object.entries(accentMap)) {
      if (blocks.length > 0) this._instanced(blocks, parseInt(hex))
    }

    this._buildConnectors()
    this._buildStars()
  }

  _instanced(blocks, color) {
    if (!blocks.length) return

    const geo  = new THREE.BoxGeometry(BS, BS, BS)
    const mat  = new THREE.MeshLambertMaterial({ color })
    const mesh = new THREE.InstancedMesh(geo, mat, blocks.length)
    mesh.frustumCulled = false // islands stay visible; small enough to skip culling overhead

    const dummy = new THREE.Object3D()
    blocks.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
  }

  // Floating block bridges between hub and each outer island
  _buildConnectors() {
    const hub = THEME.islands.math.pos
    const outer = ['science', 'technology', 'engineering', 'art']

    for (const id of outer) {
      const target = THEME.islands[id].pos
      this._bridgePath(hub, target)
    }
  }

  _bridgePath(from, to) {
    const steps  = 6
    const blocks = []

    for (let i = 1; i < steps; i++) {
      const t  = i / steps
      const x  = from[0] + (to[0] - from[0]) * t
      const z  = from[2] + (to[2] - from[2]) * t
      const y  = from[1] - 2 + Math.sin(t * Math.PI) * 1.5

      // 2x1 platform per step
      for (let dx = -1; dx <= 1; dx++) {
        blocks.push({ x: x + dx, y, z })
      }
    }

    this._instanced(blocks, THEME.brand.yellowDark)
  }

  // Particle-like stars in the background for depth
  _buildStars() {
    const geo    = new THREE.BufferGeometry()
    const count  = 600
    const verts  = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      verts[i * 3]     = (Math.random() - 0.5) * 300
      verts[i * 3 + 1] = (Math.random() - 0.5) * 150 + 20
      verts[i * 3 + 2] = (Math.random() - 0.5) * 300
    }

    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    const mat  = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 })
    const stars = new THREE.Points(geo, mat)
    this.scene.add(stars)
  }

  // Island lookup by id — used by InteractionSystem later
  getIsland(id) {
    return this.islands.find(i => i.id === id)
  }

  update(_delta, _elapsed) {
    // reserved — island animations (gentle float, etc.) come here
  }
}
