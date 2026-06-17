export const BS = 1.0 // block size in world units

// Pseudo-random noise (deterministic per position — no library needed)
const noise = (x, z) => Math.abs(Math.sin(x * 13.7 + z * 7.3))

export class BaseIsland {
  constructor({ id, position, radius, maxDepth = 4, style = 'flat' }) {
    this.id       = id
    this.position = position   // [x, y, z] — top surface center
    this.radius   = radius
    this.maxDepth = maxDepth
    this.style    = style

    // Block data — SteamMap reads these to build InstancedMeshes
    this.topBlocks    = []  // yellow surface layer
    this.bodyBlocks   = []  // black underside
    this.accentBlocks = []  // island-specific color, above surface

    this._generate()
  }

  _generate() {
    const [px, py, pz] = this.position

    for (let ix = -this.radius; ix <= this.radius; ix++) {
      for (let iz = -this.radius; iz <= this.radius; iz++) {
        const dist = Math.sqrt(ix * ix + iz * iz)
        if (dist > this.radius) continue

        const wx = px + ix * BS
        const wz = pz + iz * BS

        // Surface elevation (+0 = flat, +N = raised terrain)
        const lift   = this._surfaceLift(ix, iz, dist) * BS
        const topY   = py + lift

        this.topBlocks.push({ x: wx, y: topY, z: wz })

        // Underside — tapers toward edges
        const depth = Math.max(1, Math.round((1 - dist / this.radius) * this.maxDepth))
        for (let d = 1; d <= depth; d++) {
          this.bodyBlocks.push({ x: wx, y: topY - d * BS, z: wz })
        }
      }
    }

    this._addAccents()
  }

  // Override per style: returns how many blocks above base the surface rises
  _surfaceLift(ix, iz, dist) {
    switch (this.style) {
      case 'dome':
        // Central peak — science island
        return Math.round((1 - dist / this.radius) * 3)

      case 'grid':
        // Grid ridges — technology island
        return (Math.abs(ix) % 3 === 0 || Math.abs(iz) % 3 === 0) ? 1 : 0

      case 'organic':
        // Noisy peaks — art island
        return Math.round(noise(ix, iz) * 3)

      case 'terraced':
        // Concentric rings — engineering island
        return Math.floor((1 - dist / this.radius) * 3)

      case 'hub':
      default:
        // Flat with small bump at center — math hub
        return dist < 2 ? 1 : 0
    }
  }

  // Override per style: adds themed blocks above the top surface
  _addAccents() {
    const [px, py, pz] = this.position

    switch (this.style) {
      case 'hub': {
        // Ring of pillars around the hub center
        const count = 8
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2
          const r     = this.radius - 2
          const ax    = px + Math.round(Math.cos(angle) * r)
          const az    = pz + Math.round(Math.sin(angle) * r)
          this.accentBlocks.push({ x: ax, y: py + 1, z: az })
          this.accentBlocks.push({ x: ax, y: py + 2, z: az })
        }
        // Central obelisk
        for (let h = 1; h <= 4; h++) {
          this.accentBlocks.push({ x: px, y: py + h, z: pz })
        }
        break
      }

      case 'dome': {
        // Small crystals on the peak
        for (let h = 1; h <= 3; h++) {
          this.accentBlocks.push({ x: px, y: py + 3 + h, z: pz })
        }
        break
      }

      case 'grid': {
        // Corner towers
        const corners = [
          [-3, -3], [3, -3], [3, 3], [-3, 3]
        ]
        for (const [cx, cz] of corners) {
          for (let h = 1; h <= 3; h++) {
            this.accentBlocks.push({ x: px + cx, y: py + h, z: pz + cz })
          }
        }
        break
      }

      case 'organic': {
        // Random scattered blocks — art island
        for (let ix = -2; ix <= 2; ix++) {
          for (let iz = -2; iz <= 2; iz++) {
            if (noise(ix * 5, iz * 5) > 0.6) {
              const h = Math.round(noise(ix, iz) * 2) + 1
              this.accentBlocks.push({ x: px + ix, y: py + h, z: pz + iz })
            }
          }
        }
        break
      }

      case 'terraced': {
        // Gear-like protrusions
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2
          const gx = px + Math.round(Math.cos(angle) * 3)
          const gz = pz + Math.round(Math.sin(angle) * 3)
          this.accentBlocks.push({ x: gx, y: py + 1, z: gz })
          this.accentBlocks.push({ x: gx, y: py + 2, z: gz })
        }
        break
      }
    }
  }
}
