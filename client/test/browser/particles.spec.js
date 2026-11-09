import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test.use({ viewport: { width: 1920, height: 1080 } })

test('space particles render behind the real terrain using one additional draw call', async ({ page }) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  // This isolated harness has no app favicon; keep console failures specific
  // to the world assets and shader rather than the browser's implicit request.
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount())
  await page.evaluate(() => {
    const world = window.world
    world.loop.stop()
    world.engine.controls.enableDamping = false
    const position = world.characters.active.position
    // A lower desktop orbit exposes the space above the home island.
    world.engine.controls.target.copy(position).y += 1
    world.engine.camera.position.copy(position).add({ x: 3, y: 3, z: 10 })
    world.engine.controls.update()
    world.spaceParticles.update(0, 0)
  })
  const checks = await page.evaluate(() => {
    const world = window.world
    const renderer = world.engine.renderer
    const gl = renderer.getContext()
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
    const capture = visible => {
      world.spaceParticles.points.visible = visible
      renderer.info.autoReset = false
      renderer.info.reset()
      world.engine.render()
      const pixels = new Uint8Array(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return { pixels, calls: renderer.info.render.calls }
    }
    const before = capture(false), after = capture(true)
    // Keep the camera and every world object fixed; advance only one second
    // of particle updates to verify visible shader motion, not just a timer.
    for (let frame = 0; frame < 30; frame++) world.spaceParticles.update(1 / 30)
    const moving = capture(true)
    let changedSky = 0, terrainPixels = 0, changedTerrain = 0, movingSky = 0
    const isWarm = index => before.pixels[index] > 40 && before.pixels[index] > before.pixels[index + 1] * 1.15 && before.pixels[index + 1] > before.pixels[index + 2] * 1.3
    const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]
    for (let index = 0; index < before.pixels.length; index += 4) {
      const red = before.pixels[index], green = before.pixels[index + 1], blue = before.pixels[index + 2]
      const changed = Math.abs(red - after.pixels[index]) + Math.abs(green - after.pixels[index + 1]) + Math.abs(blue - after.pixels[index + 2]) > 6
      // Antialiased silhouettes blend terrain with the sky behind it. Check
      // fully covered interiors, where a background particle must be occluded.
      const terrain = isWarm(index) && neighbors.every(offset => isWarm(index + offset * 4))
      if (terrain) {
        terrainPixels++
        if (changed) changedTerrain++
      } else {
        if (changed) changedSky++
        const motion = Math.abs(after.pixels[index] - moving.pixels[index]) + Math.abs(after.pixels[index + 1] - moving.pixels[index + 1]) + Math.abs(after.pixels[index + 2] - moving.pixels[index + 2]) > 12
        if (motion) movingSky++
      }
    }
    renderer.info.autoReset = true
    return { changedSky, movingSky, terrainPixels, changedTerrain, extraDrawCalls: after.calls - before.calls, glError: gl.getError() }
  })
  expect(checks.changedSky).toBeGreaterThan(100)
  expect(checks.movingSky, 'motion must be visible with a stationary camera over one second').toBeGreaterThan(1000)
  expect(checks.terrainPixels).toBeGreaterThan(100000)
  expect(checks.changedTerrain).toBe(0)
  expect(checks.extraDrawCalls).toBe(1)
  expect(checks.glError).toBe(0)
  await expect(page.locator('#canvas')).toHaveCount(1)
  await mkdir('../screenshots/space-particles', { recursive: true })
  await page.evaluate(() => { window.world.spaceParticles.points.visible = false; window.world.engine.render() })
  await page.screenshot({ path: '../screenshots/space-particles/before-desktop.png' })
  await page.evaluate(() => { window.world.spaceParticles.points.visible = true; window.world.engine.render() })
  await page.screenshot({ path: '../screenshots/space-particles/after-desktop.png' })
  await page.evaluate(() => window.unmount())
  expect(errors).toEqual([])
})

test('desktop motion preference freezes and resumes particles while the world stays available', async ({ page }) => {
  test.setTimeout(120000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount())
  await expect.poll(() => page.evaluate(() => window.world.loop.clock.elapsed)).toBeGreaterThan(0.1)
  expect(await page.evaluate(() => window.world.spaceParticles.points.material.uniforms.uTime.value)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.evaluate(() => window.world.spaceParticles.points.material.uniforms.uTime.value)).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => window.world.spaceParticles.reducedMotion)).toBe(true)
  const frozen = await page.evaluate(() => ({ time: window.world.spaceParticles.points.material.uniforms.uTime.value, elapsed: window.world.loop.clock.elapsed }))
  await expect.poll(() => page.evaluate(() => window.world.loop.clock.elapsed)).toBeGreaterThan(frozen.elapsed + 0.1)
  expect(await page.evaluate(() => window.world.spaceParticles.points.material.uniforms.uTime.value)).toBe(frozen.time)
  await expect(page.locator('#canvas')).toBeVisible()
  await page.evaluate(() => window.unmount())
})
