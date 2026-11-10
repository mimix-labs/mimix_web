import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Vector3, AmbientLight, AnimationClip, VectorKeyframeTrack } from 'three'
import { WallEAnimator } from '../src/entities/walle/WallEAnimator.js'

async function createIntro({ reducedMotion = false, animated = false, procedural = false, canvas = null } = {}) {
  const { WorldIntro } = await import('../src/systems/WorldIntro.js')
  const scene = new Scene()
  const character = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial())
  character.position.set(0, 0.32, 0)
  const head = new Group(); head.name = 'Head'; character.add(head)
  const boneRoot = new Group(); boneRoot.name = 'Root'; character.add(boneRoot)
  const model = new Group(); character.add(model)
  const arm = new Mesh(new BoxGeometry(0.2, 0.5, 0.2), new MeshBasicMaterial())
  arm.name = 'BRAZOD'; model.add(arm)
  const poseAnimator = procedural ? new WallEAnimator(model) : null
  poseAnimator?.play('greeting')
  const animations = animated ? ['Float', 'Wave'].map((name, index) => new AnimationClip(name, 2.5, [
    new VectorKeyframeTrack('Head.position', [0, 1, 2.5], [0, 0, 0, 0, index + 1, 0, 0, 0, 0]),
    new VectorKeyframeTrack('Root.position', [0, 2.5], [0, 4, 0, 0, 4, 0]),
  ])) : []
  const island = new Group()
  island.scale.set(3, 3, 3)
  const hidden = new Group()
  hidden.visible = false
  const particles = new Group()
  particles.name = 'SpaceParticles'
  const light = new AmbientLight()
  scene.add(character, island, hidden, particles, light)
  const camera = new PerspectiveCamera(60, 1.6, 0.1, 500)
  camera.position.set(6, 7, 6)
  const controls = { target: new Vector3(), enabled: true }
  const input = { enabled: true, keys: { KeyW: true }, setEnabled(enabled) { this.enabled = enabled; this.keys = {} } }
  const motionQuery = new EventTarget()
  motionQuery.matches = reducedMotion
  let completed = 0
  let time = 0
  const intro = new WorldIntro({ scene, character, camera, controls, input, animations, poseAnimator, canvas, motionQuery, now: () => time, onComplete: () => { completed++ } })
  const advance = (seconds, simulationDelta = seconds) => { time += seconds * 1000; intro.update(simulationDelta) }
  return { intro, advance, character, head, boneRoot, poseAnimator, island, hidden, particles, light, camera, controls, input, motionQuery, completed: () => completed }
}

test('Wall-E without baked clips greets while floating and resets its pose for reduced motion and exploration', async () => {
  const view = await createIntro({ procedural: true })
  try {
    const baseY = view.character.position.y
    for (let i = 0; i < 15; i++) view.advance(0.05)
    assert.notEqual(view.character.position.y, baseY)
    assert.ok(view.poseAnimator.rightArm.rotation.z > 0.3)
    view.motionQuery.matches = true
    view.motionQuery.dispatchEvent(new Event('change'))
    view.advance(0.05)
    assert.equal(view.poseAnimator.rightArm.rotation.z, 0)
    const time = view.poseAnimator.time
    view.advance(1)
    assert.equal(view.poseAnimator.time, time)
    view.motionQuery.matches = false
    view.motionQuery.dispatchEvent(new Event('change'))
    view.poseAnimator.play('greeting')
    view.advance(0.05)
    assert.ok(view.poseAnimator.rightArm.rotation.z > 0)
    view.intro.start(); view.advance(1)
    assert.equal(view.poseAnimator.rightArm.rotation.z, 0)
    assert.equal(view.poseAnimator.action, null)
  } finally { view.intro.dispose() }
})

test('space entry hides terrain, keeps character/particles/lights and locks navigation', async () => {
  const view = await createIntro()
  try {
    assert.equal(view.island.visible, false)
    assert.equal(view.character.visible, true)
    assert.equal(view.particles.visible, true)
    assert.equal(view.light.visible, true)
    assert.equal(view.controls.enabled, false)
    assert.equal(view.input.enabled, false)
    assert.deepEqual(view.input.keys, {})
    assert.ok(view.character.position.y > 0.32)
    const first = view.character.position.y
    view.advance(0.3)
    assert.notEqual(view.character.position.y, first)
  } finally { view.intro.dispose() }
})

test('Play reveals the map, lands the character and enables controls only when transition finishes', async () => {
  const view = await createIntro()
  try {
    assert.equal(view.intro.start(), true)
    assert.equal(view.intro.start(), false)
    view.advance(0.4)
    assert.equal(view.island.visible, true)
    assert.equal(view.input.enabled, false)
    assert.equal(view.controls.enabled, false)
    assert.equal(view.completed(), 0)
    view.advance(0.6)
    assert.equal(view.intro.phase, 'exploring')
    assert.equal(view.input.enabled, true)
    assert.equal(view.controls.enabled, true)
    assert.deepEqual(view.character.position.toArray(), [0, 0.32, 0])
    assert.deepEqual(view.island.scale.toArray(), [3, 3, 3])
    assert.equal(view.hidden.visible, false)
    assert.equal(view.camera.fov, 60)
    assert.equal(view.completed(), 1)
    view.advance(1)
    assert.equal(view.completed(), 1)
  } finally { view.intro.dispose() }
})

test('reduced motion has a static space entry and enters the map immediately', async () => {
  const view = await createIntro({ reducedMotion: true })
  try {
    const position = view.character.position.clone()
    view.advance(0.5)
    assert.deepEqual(view.character.position.toArray(), position.toArray())
    view.intro.start()
    assert.equal(view.intro.phase, 'exploring')
    assert.equal(view.input.enabled, true)
    assert.equal(view.completed(), 1)
  } finally { view.intro.dispose() }
})

test('changing to reduced motion completes an in-progress transition', async () => {
  const view = await createIntro()
  try {
    view.intro.start()
    view.advance(0.2)
    view.motionQuery.matches = true
    view.motionQuery.dispatchEvent(new Event('change'))
    assert.equal(view.intro.phase, 'exploring')
    assert.equal(view.completed(), 1)
  } finally { view.intro.dispose() }
})

test('disposal during entry restores scene state without starting navigation', async () => {
  const view = await createIntro()
  view.intro.dispose()
  view.intro.dispose()
  view.advance(1)
  assert.equal(view.island.visible, true)
  assert.deepEqual(view.island.scale.toArray(), [3, 3, 3])
  assert.deepEqual(view.character.position.toArray(), [0, 0.32, 0])
  assert.equal(view.completed(), 0)
  assert.equal(view.input.enabled, false)
})

test('slow physics frames do not stretch the presentation beyond its real-time duration', async () => {
  const view = await createIntro()
  try {
    view.intro.start()
    view.advance(1, 0.05)
    assert.equal(view.intro.phase, 'exploring')
    assert.equal(view.completed(), 1)
  } finally { view.intro.dispose() }
})

test('animated welcome floats, waves occasionally and returns to float without baked root displacement', async () => {
  const view = await createIntro({ animated: true })
  try {
    for (let i = 0; i < 20; i++) view.advance(0.05)
    assert.ok(view.head.position.y > 0)
    assert.equal(view.boneRoot.position.y, 0)
    for (let i = 0; i < 82; i++) view.advance(0.05)
    assert.equal(view.intro.currentAction.getClip().name, 'Wave')
    for (let i = 0; i < 55; i++) view.advance(0.05)
    assert.equal(view.intro.currentAction.getClip().name, 'Float')
    view.intro.start(); view.advance(1)
    assert.equal(view.head.position.y, 0)
    assert.equal(view.intro.mixer.stats.actions.inUse, 0)
  } finally { view.intro.dispose() }
})

test('cursor tilts the character, returns to neutral on leave and is removed on disposal', async () => {
  const canvas = new EventTarget()
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 })
  const view = await createIntro({ animated: true, canvas })
  const move = () => canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 100, clientY: 100 }))
  try {
    move(); for (let i = 0; i < 20; i++) view.advance(0.05)
    assert.ok(view.character.rotation.y > view.intro.previewRotation.y + 0.25)
    canvas.dispatchEvent(new Event('pointerleave'))
    for (let i = 0; i < 30; i++) view.advance(0.05)
    assert.ok(Math.abs(view.character.rotation.y - view.intro.previewRotation.y) < 0.001)
    view.motionQuery.matches = true; view.motionQuery.dispatchEvent(new Event('change'))
    const mixerTime = view.intro.mixer.time
    move(); view.advance(1)
    assert.equal(view.intro.mixer.time, mixerTime)
    assert.equal(view.character.rotation.y, view.intro.previewRotation.y)
    view.intro.dispose(); view.intro.pointer.set(0, 0); move()
    assert.equal(view.intro.pointer.length(), 0)
  } finally { view.intro.dispose() }
})
