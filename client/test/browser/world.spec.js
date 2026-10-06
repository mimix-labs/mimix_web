import { test, expect } from '@playwright/test'
test('shared world keeps movement, camera, collisions, entrances and releases every mount', async ({ page }) => {
  test.setTimeout(180000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate(() => window.mount())
    const initial = await page.evaluate(() => window.world.characters.active.position.toArray())
    await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW')
    const moved = await page.evaluate(() => window.world.characters.active.position.toArray())
    expect(moved).not.toEqual(initial)
    const checks = await page.evaluate(() => {
      const w = window.world
      const bridge = w.steamMap.bridges[0].getWalkwayHeightAt(0.5, -29)
      const outside = w.steamMap.resolveMovement(w.characters.active.position, { x: 9999, y: 0, z: 9999 })
      const bounds = [w.engine.controls.minDistance, w.engine.controls.maxDistance]
      // Run the real trigger with the player in each activation radius.
      w.characters.active.position.set(0, 0, -42); w.mathChallenge.update(0, 0)
      w.characters.active.position.set(42, 0, 0); w.scienceChallenge.update(0, 0)
      window.unmount()
      return { bridge, outside, bounds, visits: window.visits, running: w.loop._running, children: w.engine.scene.children.length, pending: w.assets.pending, keys: w.input.keys, workers: w.assets.draco.workerPool.length, gpu: { ...w.engine.renderer.info.memory } }
    })
    expect(checks.bridge).not.toBeNull()
    expect(checks.outside).toBeNull()
    expect(checks.bounds).toEqual([6, 16])
    expect(checks.visits.at(-2)).toContain('/challenges/mathematics/index.html')
    expect(checks.visits.at(-1)).toContain('/challenges/science/index.html')
    expect(checks.running).toBe(false)
    expect(checks.children).toBe(0)
    expect(checks.pending).toBe(0)
    expect(checks.keys).toEqual({})
    expect(checks.workers).toBe(0)
    expect(checks.gpu).toEqual({ geometries: 0, textures: 0 })
    await page.keyboard.down('ArrowUp')
    expect(await page.evaluate(() => window.world.input.keys)).toEqual({})
    await page.keyboard.up('ArrowUp')
  }
  expect(errors).toEqual([])
})

test('leaving during download cancels pending work without restarting animation', async ({ page }) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/assets/models/**/*.glb', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.abort() })
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => { window.result = window.mount().catch(error => error.name) })
  await page.waitForFunction(() => window.world?.assets.pending > 0)
  await page.evaluate(() => window.unmount())
  expect(await page.evaluate(() => window.result)).toBe('AbortError')
  expect(await page.evaluate(() => window.world.loop._running)).toBe(false)
  expect(await page.evaluate(() => window.world.assets.pending)).toBe(0)
  expect(errors).toEqual([])
})

test('shared UI survives immediate StrictMode-style cleanup and remount', async ({ page }) => {
  test.setTimeout(60000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('mimix-onboarding-v2', 'seen'))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(async () => {
    const first = window.mountUI(); first.dispose()
    window.view = window.mountUI()
    await Promise.all([first.ready, window.view.ready])
  })
  await expect(page.locator('#world-loading')).toHaveCount(0)
  await expect(page.locator('#canvas')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Abrir guía de uso' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Abrir guía de uso' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => { window.view.dispose(); window.view.dispose() })
  await expect(page.locator('#canvas')).toHaveCount(0)
  await expect(page.locator('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})
