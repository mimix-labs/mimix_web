import * as THREE from 'three'

const BS = 1 // tamaño de cada cubo (block size)

// Genera una isla voxel flotante: cima plana caminable que se estrecha
// hacia una punta abajo, con borde neón (brilla por el bloom) y un faro
// opcional en el centro (la "estación" donde vivirá el reto).
// Es paramétrica: misma clase → HOME y las 5 islas STEAM.
export class VoxelIsland {
  // parent = grupo/escena donde colgarse. options: posición, color, radio, profundidad, faro
  constructor(parent, { position = [0, 0, 0], color = 0x4FC3F7, radius = 6, depth = 8, beacon = false } = {}) {
    this.parent = parent
    this.group  = new THREE.Group()
    this.group.position.set(...position)
    this.meshes = []

    this._buildBody(color, radius, depth)
    // El neón (bordes + faro) se añade AL FINAL, cuando definamos el color.
    // this._buildNeonRim(color, radius)
    // if (beacon) this._buildBeacon(color)

    this.parent.add(this.group)
  }

  // Cuerpo: roca oscura que se estrecha; la cima lleva un tinte del color
  _buildBody(color, radius, depth) {
    const rock    = new THREE.Color(0x2a2f3a)
    const surface = rock.clone().lerp(new THREE.Color(color), 0.22)

    const cubes = []
    for (let level = 0; level < depth; level++) {
      const r = radius * (1 - level / depth) // el radio mengua hacia la punta
      const y = -level
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        for (let z = -Math.ceil(r); z <= Math.ceil(r); z++) {
          if (x * x + z * z <= r * r) {
            cubes.push({ x, y, z, c: level === 0 ? surface : rock })
          }
        }
      }
    }
    this._addInstanced(cubes, { geo: new THREE.BoxGeometry(BS, BS, BS), lit: true, colored: true })
  }

  // Borde neón: anillo exterior de la cima, material "unlit" → brilla con bloom
  _buildNeonRim(color, radius) {
    const ring = []
    const r = radius
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      for (let z = -Math.ceil(r); z <= Math.ceil(r); z++) {
        const d = x * x + z * z
        if (d <= r * r && d > (r - 1) * (r - 1)) ring.push({ x, y: 0.55, z })
      }
    }
    this._addInstanced(ring, { geo: new THREE.BoxGeometry(BS, BS * 0.5, BS), color, lit: false })
  }

  // Faro central: columna brillante que marca la estación de reto
  _buildBeacon(color) {
    const col = []
    for (let y = 1; y <= 4; y++) col.push({ x: 0, y, z: 0 })
    this._addInstanced(col, { geo: new THREE.BoxGeometry(BS * 0.5, BS, BS * 0.5), color, lit: false })
  }

  // Helper: crea UN InstancedMesh con la lista de cubos y lo añade al grupo
  _addInstanced(list, { geo, color, lit, colored = false }) {
    const mat = lit
      ? new THREE.MeshStandardMaterial({ color: color ?? 0xffffff, roughness: 1, metalness: 0 })
      : new THREE.MeshBasicMaterial({ color })

    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    const m = new THREE.Matrix4()
    list.forEach((p, i) => {
      m.setPosition(p.x, p.y, p.z)
      mesh.setMatrixAt(i, m)
      if (colored && p.c) mesh.setColorAt(i, p.c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    this.group.add(mesh)
    this.meshes.push(mesh)
  }

  // Libera memoria de todas las mallas y se quita del padre
  dispose() {
    this.meshes.forEach(msh => { msh.geometry.dispose(); msh.material.dispose() })
    this.parent.remove(this.group)
  }
}