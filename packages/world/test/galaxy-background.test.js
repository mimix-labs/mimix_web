import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Vector2 } from 'three'

async function createGalaxy(options = {}) {
  const { GalaxyBackground } = await import('../src/fx/GalaxyBackground.js')
  const scene = new Scene()
  const canvas = new EventTarget()
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 800, height: 600 })
  const motionQuery = new EventTarget()
  motionQuery.matches = false
  const document = { hidden: false }
  const renderer = { getDrawingBufferSize: target => target.set(1600, 1200) }
  const effect = new GalaxyBackground(scene, { canvas, renderer, motionQuery, document, intro: false, ...options })
  const pointer = (type, values = {}) => canvas.dispatchEvent(Object.assign(new Event(type), { clientX: 210, clientY: 170, button: 0, ...values }))
  return { effect, scene, canvas, motionQuery, document, pointer }
}

test('Galaxy arrival reveals the stars once and cannot restart after Play leaves the preview', async () => {
  const { effect } = await createGalaxy({ intro: true })
  try {
    effect.setInteractive(true)
    assert.equal(effect.mesh.material.uniforms.uReveal.value, 0)
    effect.update(0.05)
    assert.ok(effect.mesh.material.uniforms.uReveal.value > 0)
    assert.ok(effect.mesh.material.uniforms.uWarp.value > 0)
    effect.setInteractive(false)
    effect.setTransitionProgress(1)
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uReveal.value, 1)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
  } finally { effect.dispose() }
})

test('only an enabled primary background click triggers a temporary Galaxy warp', async () => {
  const { effect, pointer } = await createGalaxy()
  try {
    pointer('pointerdown')
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
    effect.setInteractive(true)
    pointer('pointerdown', { button: 2 })
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
    pointer('pointerdown')
    effect.update(0.05)
    assert.ok(effect.mesh.material.uniforms.uWarp.value > 0.5)
    for (let frame = 0; frame < 120; frame++) effect.update(0.05)
    assert.ok(effect.mesh.material.uniforms.uWarp.value < 0.01)
    effect.setInteractive(false)
    pointer('pointerdown')
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
  } finally { effect.dispose() }
})

test('reduced motion and hidden tabs freeze Galaxy and suppress pointer effects', async () => {
  const { effect, motionQuery, document, pointer } = await createGalaxy()
  try {
    effect.setInteractive(true)
    effect.update(0.05)
    const moving = effect.mesh.material.uniforms.uTime.value
    motionQuery.matches = true
    motionQuery.dispatchEvent(new Event('change'))
    pointer('pointerdown')
    effect.setTransitionProgress(0.5)
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uTime.value, moving)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
    assert.equal(effect.mesh.material.uniforms.uMouseActiveFactor.value, 0)
    motionQuery.matches = false
    motionQuery.dispatchEvent(new Event('change'))
    document.hidden = true
    effect.update(0.05)
    assert.equal(effect.mesh.material.uniforms.uTime.value, moving)
    document.hidden = false
    effect.update(0.05)
    assert.ok(effect.mesh.material.uniforms.uTime.value > moving)
  } finally { effect.dispose() }
})

test('Galaxy tracks drawing-buffer resize and clears its transition pulse', async () => {
  const { effect } = await createGalaxy()
  try {
    effect.update(0)
    assert.deepEqual(effect.mesh.material.uniforms.uResolution.value, new Vector2(1600, 1200))
    effect.setTransitionProgress(0.5)
    assert.ok(effect.mesh.material.uniforms.uWarp.value > 0)
    effect.setTransitionProgress(1)
    assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
  } finally { effect.dispose() }
})

test('disposing Galaxy releases its GPU resources and removes all pointer listeners once', async () => {
  const { effect, scene, canvas, motionQuery, pointer } = await createGalaxy()
  let geometries = 0, materials = 0, pointers = 0, motions = 0
  effect.mesh.geometry.addEventListener('dispose', () => { geometries++ })
  effect.mesh.material.addEventListener('dispose', () => { materials++ })
  const removePointer = canvas.removeEventListener.bind(canvas)
  canvas.removeEventListener = (...args) => { pointers++; removePointer(...args) }
  const removeMotion = motionQuery.removeEventListener.bind(motionQuery)
  motionQuery.removeEventListener = (...args) => { motions++; removeMotion(...args) }
  effect.setInteractive(true)
  effect.dispose()
  effect.dispose()
  pointer('pointerdown')
  effect.update(0.05)
  assert.equal(scene.children.length, 0)
  assert.deepEqual({ geometries, materials, pointers, motions }, { geometries: 1, materials: 1, pointers: 3, motions: 1 })
  assert.equal(effect.mesh.material.uniforms.uWarp.value, 0)
})

test('runner acceleration scales star travel without changing glow or animation timing', async () => {
  const normal = await createGalaxy()
  const fast = await createGalaxy()
  try {
    for (let frame = 0; frame < 60; frame++) {
      normal.effect.update(1 / 60, 1)
      fast.effect.update(1 / 60, 8)
    }
    const a = normal.effect.mesh.material.uniforms
    const b = fast.effect.mesh.material.uniforms
    assert.ok(Math.abs(b.uDepth.value - a.uDepth.value * 8) < 1e-10)
    assert.ok(Math.abs(b.uGloss.value - a.uGloss.value * 8) < 1e-10)
    for (const key of ['uTime', 'uStarGlow', 'uFlareGain', 'uTwinkleIntensity', 'uRotationAngle']) {
      assert.equal(b[key].value, a[key].value)
    }
    fast.motionQuery.matches = true
    fast.motionQuery.dispatchEvent(new Event('change'))
    const depth = b.uDepth.value
    fast.effect.update(1 / 60, 100)
    assert.equal(b.uDepth.value, depth)
  } finally {
    normal.effect.dispose()
    fast.effect.dispose()
  }
})
