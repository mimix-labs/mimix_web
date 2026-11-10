import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Vector3 } from 'three'

const createEffect = async (options = {}) => {
  const { SpaceParticles } = await import('../src/fx/SpaceParticles.js')
  const scene = new Scene()
  const motionQuery = new EventTarget()
  motionQuery.matches = false
  const document = { hidden: false }
  const renderer = { getPixelRatio: () => 2 }
  const effect = new SpaceParticles(scene, { renderer, motionQuery, document, ...options })
  return { effect, scene, motionQuery, document }
}

test('particles remain outside the playable world and share its depth', async () => {
  const { effect, scene } = await createEffect()
  try {
    assert.equal(scene.children.length, 1)
    assert.equal(effect.points.isPoints, true)
    assert.equal(effect.points.material.depthTest, true)
    assert.equal(effect.points.material.depthWrite, false)
    const positions = effect.points.geometry.getAttribute('position')
    effect.points.updateMatrixWorld(true)
    const center = new Vector3(20, 0, -20)
    const position = new Vector3()
    assert.ok(positions.count > 0 && positions.count <= 3600)
    for (let index = 0; index < positions.count; index++) {
      position.fromBufferAttribute(positions, index).applyMatrix4(effect.points.matrixWorld)
      assert.ok(position.distanceTo(center) >= 140, 'keep the entire cloud beyond the islands')
    }
  } finally { effect.dispose() }
})

test('reduced motion changes freeze and resume the existing field without a jump', async () => {
  const { effect, motionQuery } = await createEffect()
  try {
    effect.update(0.05, 100)
    const movingTime = effect.points.material.uniforms.uTime.value
    assert.ok(movingTime > 0)
    motionQuery.matches = true
    motionQuery.dispatchEvent(new Event('change'))
    effect.update(0.05, 1000)
    assert.equal(effect.points.material.uniforms.uTime.value, movingTime)
    motionQuery.matches = false
    motionQuery.dispatchEvent(new Event('change'))
    effect.update(0.05, 1001)
    const resumedTime = effect.points.material.uniforms.uTime.value
    assert.ok(resumedTime > movingTime && resumedTime < movingTime + 0.1)
  } finally { effect.dispose() }
})

test('initial reduced motion and hidden tabs keep the particles static', async () => {
  const motionQuery = new EventTarget()
  motionQuery.matches = true
  const { effect, document } = await createEffect({ motionQuery })
  try {
    effect.update(0.05, 100)
    assert.equal(effect.points.material.uniforms.uTime.value, 0)
    motionQuery.matches = false
    motionQuery.dispatchEvent(new Event('change'))
    document.hidden = true
    effect.update(0.05, 1000)
    assert.equal(effect.points.material.uniforms.uTime.value, 0)
    document.hidden = false
    effect.update(0.05, 1001)
    assert.ok(effect.points.material.uniforms.uTime.value > 0)
  } finally { effect.dispose() }
})

test('disposal removes the field, releases GPU resources once and detaches motion listeners', async () => {
  const { effect, scene, motionQuery } = await createEffect()
  let geometries = 0, materials = 0, removals = 0
  effect.points.geometry.addEventListener('dispose', () => { geometries++ })
  effect.points.material.addEventListener('dispose', () => { materials++ })
  const originalRemove = motionQuery.removeEventListener.bind(motionQuery)
  motionQuery.removeEventListener = (...args) => { removals++; originalRemove(...args) }
  effect.dispose()
  effect.dispose()
  effect.update(0.05, 10)
  assert.equal(scene.children.length, 0)
  assert.deepEqual({ geometries, materials, removals }, { geometries: 1, materials: 1, removals: 1 })
  assert.equal(effect.points.material.uniforms.uTime.value, 0)
})

test('the Galaxy-inspired transition pulse finishes cleanly and respects reduced motion', async () => {
  const { effect, motionQuery } = await createEffect()
  try {
    effect.setTransitionProgress(0)
    assert.equal(effect.points.material.uniforms.uWarp.value, 0)
    effect.setTransitionProgress(0.5)
    assert.ok(effect.points.material.uniforms.uWarp.value > 0)
    effect.setTransitionProgress(1)
    assert.equal(effect.points.material.uniforms.uWarp.value, 0)
    motionQuery.matches = true
    motionQuery.dispatchEvent(new Event('change'))
    effect.setTransitionProgress(0.5)
    assert.equal(effect.points.material.uniforms.uWarp.value, 0)
  } finally { effect.dispose() }
})
