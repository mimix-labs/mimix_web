import * as THREE from 'three'

const BS = 1

// Puente voxel recto entre dos puntos del plano (suelo de roca + filos neón).
// Permite que Wall-E cruce de HOME a cada isla STEAM.
export class Bridge {
  // from / to = { x, z } en coordenadas del mundo
  constructor(from, to, { color = 0x6fe9ff, width = 3 } = {}) {
    this.group  = new THREE.Group()
    this.meshes = []
    this._build(from, to, color, width)
  }

  _build(from, to, color, width) {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const len = Math.hypot(dx, dz)
    const ux = dx / len, uz = dz / len   // dirección a lo largo del puente
    const px = -uz, pz = ux              // perpendicular (el ancho)
    const half = (width - 1) / 2

    const floor = [], neon = []
    // Paso fino (0.7) para que no queden huecos en los puentes diagonales
    for (let i = 0; i <= len; i += 0.7) {
      for (let w = -half; w <= half; w++) {
        const x = from.x + ux * i + px * w
        const z = from.z + uz * i + pz * w
        if (Math.abs(w) === half) neon.push({ x, z })  // bordes → neón
        else                      floor.push({ x, z }) // centro → suelo
      }
    }

    this._instance(floor, { color: 0x2a2f3a, y: 0,   lit: true,  thin: false })
    this._instance(neon,  { color,           y: 0.5, lit: false, thin: true  })
  }

  // Crea un InstancedMesh con los cubos dados
  _instance(list, { color, y, lit, thin }) {
    const geo = new THREE.BoxGeometry(BS, thin ? BS * 0.5 : BS, BS)
    const mat = lit
      ? new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
      : new THREE.MeshBasicMaterial({ color })

    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    const m = new THREE.Matrix4()
    list.forEach((p, i) => { m.setPosition(p.x, y, p.z); mesh.setMatrixAt(i, m) })
    mesh.instanceMatrix.needsUpdate = true

    this.group.add(mesh)
    this.meshes.push(mesh)
  }

  dispose() {
    this.meshes.forEach(msh => { msh.geometry.dispose(); msh.material.dispose() })
  }
}
