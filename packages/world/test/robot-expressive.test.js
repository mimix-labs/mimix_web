import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Scene, Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CharacterManager } from '../src/entities/CharacterManager.js'
import { copyWorldAssets } from '../scripts/assets.mjs'

async function robot() {
  const bytes = await readFile(new URL('../assets/robot-expressive/RobotExpressive.glb', import.meta.url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

test('the animated companion fits the map and uses Walking instead of sliding in Idle', async () => {
  const gltf = await robot()
  const input = { keys: {} }
  const manager = new CharacterManager({ scene: new Scene(), input, assets: { load: async () => gltf } })
  const controller = await manager.load('robot.glb', [0, 0.32, 0], { height: 1.8, clipNames: { walk: 'Walking', run: 'Running' } })
  const bounds = new Box3().setFromObject(manager.active)
  assert.ok(Math.abs(bounds.getSize(new Vector3()).y - 1.8) < 0.01)
  assert.ok(Math.abs(bounds.min.y - 0.32) < 0.01)
  input.keys.KeyW = true
  for (let i = 0; i < 10; i++) controller.update(0.05)
  assert.ok(manager.active.position.z < -2)
  assert.equal(controller._current.getClip().name, 'Walking')
  input.keys = {}
  controller.update(0.05)
  assert.equal(controller._current.getClip().name, 'Idle')
})

test('a greeting finishes before returning to idle, but walking can interrupt it', async () => {
  const gltf = await robot()
  const input = { keys: {} }
  const manager = new CharacterManager({ scene: new Scene(), input, assets: { load: async () => gltf } })
  const controller = await manager.load('robot.glb', [0, 0, 0], { clipNames: { walk: 'Walking' } })
  assert.equal(controller.playAction('greeting'), true)
  controller.update(0.05)
  assert.equal(controller._current.getClip().name, 'Wave')
  for (let i = 0; i < 120; i++) controller.update(0.05)
  assert.equal(controller._current.getClip().name, 'Idle')
  controller.playAction('greeting')
  input.keys.KeyD = true
  controller.update(0.05)
  assert.equal(controller._current.getClip().name, 'Walking')
  assert.equal(controller.playAction('not-a-real-action'), false)
})

test('distribution replaces stale WALL-E assets with the licensed animated companion', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mimix-assets-'))
  try {
    await mkdir(path.join(dir, 'assets/models/walle'), { recursive: true })
    await writeFile(path.join(dir, 'assets/models/walle/walle.glb'), 'stale')
    await copyWorldAssets(dir, { draco: false })
    await assert.rejects(access(path.join(dir, 'assets/models/walle/walle.glb')))
    const bytes = await readFile(path.join(dir, 'assets/models/robot-expressive/RobotExpressive.glb'))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    for (const name of ['Idle', 'Walking', 'Running', 'Wave', 'ThumbsUp', 'Dance']) {
      assert.ok(gltf.animations.some(clip => clip.name === name), name)
    }
    await access(path.join(dir, 'assets/models/robot-expressive/LICENSE.txt'))
    await access(path.join(dir, 'assets/models/islands/home.glb'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
