import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, PerspectiveCamera, Vector3, Box3 } from 'three'

async function createTitle() {
  const { SpaceWordmark } = await import('../src/fx/SpaceWordmark.js')
  const scene = new Scene()
  const camera = new PerspectiveCamera(40, 1.6, 0.1, 500)
  const anchor = new Vector3(0, 2, 0)
  camera.position.copy(anchor).add(new Vector3(5.8, 1.7, 5.8))
  camera.lookAt(anchor)
  camera.updateWorldMatrix(true, false)
  const canvas = new EventTarget()
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 })
  const title = new SpaceWordmark({ scene, camera, anchor, canvas })
  return { title, scene, camera, canvas }
}

test('title floats independently and reduced motion returns to a stable readable pose', async () => {
  const { title } = await createTitle()
  try {
    const before = title.group.children.map(letter => letter.position.clone())
    title.update(1.5)
    assert.ok(before.some((position, i) => position.distanceTo(title.group.children[i].position) > 0.015))
    title.update(0, true)
    const fixed = title.group.children.map(letter => letter.matrix.clone())
    title.update(10, true)
    title.group.children.forEach((letter, i) => assert.deepEqual(letter.matrix.elements, fixed[i].elements))
  } finally { title.dispose() }
})

test('title stays above the focal point and within the desktop camera after resize', async () => {
  const { title, camera } = await createTitle()
  try {
    for (const aspect of [1.25, 1.6, 16 / 9, 2.4]) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      title.update(0, true)
      title.group.updateWorldMatrix(true, true)
      const box = new Box3().setFromObject(title.group)
      const center = box.getCenter(new Vector3()).project(camera)
      assert.ok(center.y > 0.4 && center.y < 0.8)
      // Project each vertex instead of a world-axis box around a rotated title.
      for (const letter of title.group.children) {
        const positions = letter.geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(letter.matrixWorld).project(camera)
          assert.ok(Math.abs(point.x) < 0.85 && point.y < 0.95 && point.y > 0.3)
        }
      }
    }
  } finally { title.dispose() }
})

test('transition removes the title before exploration and disposal releases shared resources exactly once', async () => {
  const { title, scene } = await createTitle()
  const geometries = new Set(title.group.children.map(letter => letter.geometry))
  const materials = new Set(title.group.children.flatMap(letter => letter.material))
  let geometryDisposals = 0, materialDisposals = 0
  for (const geometry of geometries) geometry.addEventListener('dispose', () => { geometryDisposals++ })
  for (const material of materials) material.addEventListener('dispose', () => { materialDisposals++ })
  title.setTransitionProgress(0.25)
  assert.ok([...materials].every(material => material.opacity > 0 && material.opacity < 1))
  title.setTransitionProgress(1)
  assert.equal(title.group.visible, false)
  title.dispose()
  title.dispose()
  title.update(1)
  assert.equal(scene.children.includes(title.group), false)
  assert.equal(geometryDisposals, geometries.size)
  assert.equal(materialDisposals, materials.size)
})
