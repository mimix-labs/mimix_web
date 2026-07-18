import * as THREE from 'three'

export class StartRing {
    constructor(scene) {
        this.scene = scene

        const geo = new THREE.RingGeometry(3.65, 3.7, 64)
        const mat = new THREE.MeshBasicMaterial({
            color: 0x4ab8ff,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide, 
        })

        this.ring = new THREE.Mesh(geo, mat)
        this.ring.rotation.x = -Math.PI / 2     // tumbado sobre el suelo
        this.ring.position.y = 0.05             // un pelo sobre el grid
        this.scene.add(this.ring)
    }

    update(_delta, elapsed) {
        const t = (Math.sin(elapsed * 2) + 1) / 2
        this.ring.scale.setScalar(1 + t * 0.08)
        this.ring.material.opacity = 0.5 + t * 0.4
    }

    // Se llama cuando se quiere destruir el objeto
    dispose() {
        this.scene.remove(this.ring)
        this.ring.geometry.dispose()
        this.ring.material.dispose()
    }
}