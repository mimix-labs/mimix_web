import { test, expect } from '@playwright/test'

test('space preview blocks movement and camera, then Play restores the map and releases navigation', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount({ startInSpace: true }))
  const before = await page.evaluate(() => ({
    camera: window.world.engine.camera.position.toArray(),
    position: window.world.characters.active.position.toArray(),
    phase: window.world.phase,
    islands: Object.values(window.world.steamMap.islands).map(island => island.group.visible),
  }))
  expect(await page.evaluate(() => Boolean(window.world.characters.active.getObjectByName('TORSO')))).toBe(true)
  expect(await page.evaluate(() => window.world.intro.poseAnimator === window.world.characters.controller.previewAnimator)).toBe(true)
  expect(before.phase).toBe('intro')
  expect(before.islands).toEqual([false, false, false])
  await page.keyboard.down('KeyW')
  await page.mouse.wheel(0, -400)
  // The simulation caps frame deltas; software WebGL may need more than five
  // wall-clock seconds to deliver 300 ms of real simulation updates.
  await expect.poll(() => page.evaluate(() => window.world.loop.clock.elapsed), { timeout: 30000 }).toBeGreaterThan(0.3)
  expect(await page.evaluate(() => window.world.characters.active.position.x)).toBe(before.position[0])
  expect(await page.evaluate(() => window.world.characters.active.position.z)).toBe(before.position[2])
  const cameraDelta = await page.evaluate(camera => window.world.engine.camera.position.distanceTo({ x: camera[0], y: camera[1], z: camera[2] }), before.camera)
  expect(cameraDelta).toBeLessThan(0.001)
  expect(await page.evaluate(() => window.world.startExploring())).toBe(true)
  expect(await page.evaluate(() => window.world.startExploring())).toBe(false)
  await expect.poll(() => page.evaluate(() => window.world.phase), { timeout: 30000 }).toBe('exploring')
  expect(await page.evaluate(() => window.world.input.isPressed('KeyW'))).toBe(false)
  await page.keyboard.up('KeyW')
  const start = await page.evaluate(() => window.world.characters.active.position.z)
  await page.keyboard.down('KeyW')
  try {
    await expect.poll(() => page.evaluate(() => window.world.characters.active.position.z), { timeout: 10000 }).toBeLessThan(start)
  } finally { await page.keyboard.up('KeyW') }
  expect(await page.evaluate(() => Object.values(window.world.steamMap.islands).map(island => island.group.visible))).toEqual([true, true, true])
  await page.evaluate(() => window.unmount())
  expect(await page.evaluate(() => window.world.engine.scene.children.length)).toBe(0)
})
