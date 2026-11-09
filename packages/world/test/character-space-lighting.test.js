import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, BoxGeometry, MeshPhysicalMaterial, Texture, PerspectiveCamera, AmbientLight, DirectionalLight } from 'three'

async function createLighting() {
  const { CharacterSpaceLighting } = await import('../src/fx/CharacterSpaceLighting.js')
  const scene = new Scene()
  const material = new MeshPhysicalMaterial({ color: 0xf5c400, roughness: 1, metalness: 0, specularIntensity: 0, map: new Texture() })
  const character = new Group()
  character.add(new Mesh(new BoxGeometry(1, 2, 1), material), new Mesh(new BoxGeometry(0.5, 0.5, 0.5), material))
  const mapLight = new AmbientLight(0x334466, 0.8)
  const front = new DirectionalLight(0xffe680, 2)
  front.position.set(15, 30, 10)
  const rim = new DirectionalLight(0x4466aa, 0.4)
  rim.position.set(-10, -10, -10)
  scene.add(character, mapLight, front, rim)
  const camera = new PerspectiveCamera()
  camera.position.set(5.8, 3, 5.8)
  const frontTarget = front.target, rimTarget = rim.target
  const effect = new CharacterSpaceLighting({ scene, character, camera, front, rim })
  return { effect, scene, character, material, mapLight, frontTarget, rimTarget }
}

test('space lighting shares cloned character materials without changing its palette, textures or ambient fill', async () => {
  const { effect, character, material, mapLight } = await createLighting()
  try {
    const first = character.children[0].material
    assert.notEqual(first, material)
    assert.equal(first, character.children[1].material)
    assert.equal(first.map, material.map)
    assert.equal(first.color.getHex(), 0xf5c400)
    assert.equal(first.metalness, 0)
    assert.ok(first.specularIntensity > 0 && first.specularIntensity < 0.5)
    assert.ok(first.roughness >= 0.6)
    assert.equal(material.specularIntensity, 0)
    assert.equal(material.roughness, 1)
    assert.equal(mapLight.intensity, 0.8)
  } finally { effect.dispose() }
})

test('warp adds a bounded highlight; reduced motion keeps the steady lighting', async () => {
  const { effect } = await createLighting()
  try {
    effect.update(0)
    const steady = effect.rim.intensity
    effect.update(1)
    assert.ok(effect.rim.intensity > steady && effect.rim.intensity < steady * 2)
    effect.update(1, true)
    assert.equal(effect.rim.intensity, steady)
  } finally { effect.dispose() }
})

test('lighting follows the floating character and returns to the map state as Play finishes', async () => {
  const { effect, character } = await createLighting()
  try {
    effect.update(0)
    const initial = effect.target.position.clone()
    character.position.y += 2
    effect.update(0)
    assert.equal(effect.target.position.y, initial.y + 2)
    const full = effect.front.intensity
    effect.setTransitionProgress(0.5)
    effect.update(1)
    assert.notEqual(effect.front.intensity, full)
    effect.setTransitionProgress(1)
    effect.update(1)
    assert.equal(effect.front.intensity, 2)
    assert.equal(effect.rim.intensity, 0.4)
  } finally { effect.dispose() }
})

test('preview reuses the map lights, retaining a constant shader light count and exact original targets', async () => {
  const { effect, scene, frontTarget, rimTarget } = await createLighting()
  try {
    const lights = []
    scene.traverse(object => { if (object.isLight) lights.push(object) })
    assert.equal(lights.length, 3)
    effect.setTransitionProgress(1)
    effect.update(0)
    effect.dispose()
    assert.deepEqual(effect.front.position.toArray(), [15, 30, 10])
    assert.deepEqual(effect.rim.position.toArray(), [-10, -10, -10])
    assert.equal(effect.front.color.getHex(), 0xffe680)
    assert.equal(effect.rim.color.getHex(), 0x4466aa)
    assert.equal(effect.front.target, frontTarget)
    assert.equal(effect.rim.target, rimTarget)
    assert.equal(effect.front.target.position.length(), 0)
    assert.equal(effect.rim.target.position.length(), 0)
  } finally { effect.dispose() }
})

test('disposal restores exact material references and releases only temporary resources once', async () => {
  const { effect, scene, character, material } = await createLighting()
  let clones = 0, originals = 0, textures = 0
  character.children[0].material.addEventListener('dispose', () => { clones++ })
  material.addEventListener('dispose', () => { originals++ })
  material.map.addEventListener('dispose', () => { textures++ })
  effect.dispose()
  effect.dispose()
  effect.update(1)
  assert.equal(character.children[0].material, material)
  assert.equal(character.children[1].material, material)
  assert.deepEqual({ clones, originals, textures }, { clones: 1, originals: 0, textures: 0 })
  assert.equal(scene.children.includes(effect.rig), false)
})
