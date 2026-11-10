import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

test('Galaxy alone renders behind Wall-E, moves and visibly responds to a real background click', async ({ page }) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount({ startInSpace: true }))
  expect(await page.evaluate(() => window.world.spaceParticles)).toBeNull()
  expect(await page.evaluate(() => window.world.galaxy.mesh.visible)).toBe(true)
  await page.evaluate(() => {
    window.world.loop.stop()
    window.world.engine.controls.enableDamping = false
    // Compare the settled field independently of the initial arrival animation.
    window.world.galaxy.setInteractive(false)
    window.world.galaxy.setInteractive(true)
  })
  await page.evaluate(() => {
    window.captureGalaxy = (mode = 'normal') => {
      const { galaxy, engine } = window.world
      galaxy.mesh.visible = mode !== 'hidden'
      if (mode === 'moving') for (let frame = 0; frame < 30; frame++) galaxy.update(1 / 30)
      if (mode === 'clicked') galaxy.update(0.05)
      engine.render()
      const gl = engine.renderer.getContext()
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return { pixels, width: gl.drawingBufferWidth, warp: galaxy.mesh.material.uniforms.uWarp.value, glError: gl.getError() }
    }
    window.galaxyCaptures = [window.captureGalaxy('hidden'), window.captureGalaxy(), window.captureGalaxy('moving')]
  })
  await page.mouse.click(180, 200)
  const checks = await page.evaluate(() => {
    const [hidden, normal, moving] = window.galaxyCaptures
    const clicked = window.captureGalaxy('clicked')
    let changedSky = 0, movingSky = 0, clickedSky = 0, coveredCharacter = 0, changedCharacter = 0
    const difference = (a, b, index) => Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2])
    const warm = index => hidden.pixels[index] > 40 && hidden.pixels[index] > hidden.pixels[index + 1] * 1.15 && hidden.pixels[index + 1] > hidden.pixels[index + 2] * 1.3
    // A covered interior needs diagonal neighbors too: antialiased corners
    // legitimately blend with the sky, even when four cardinal pixels are warm.
    const neighbors = [-hidden.width - 1, -hidden.width, -hidden.width + 1, -1, 1, hidden.width - 1, hidden.width, hidden.width + 1]
    for (let index = 0; index < hidden.pixels.length; index += 4) {
      if (warm(index) && neighbors.every(offset => warm(index + offset * 4))) {
        coveredCharacter++
        if (difference(hidden.pixels, normal.pixels, index) > 6) {
          changedCharacter++
        }
      } else {
        if (difference(hidden.pixels, normal.pixels, index) > 12) changedSky++
        if (difference(normal.pixels, moving.pixels, index) > 12) movingSky++
        if (difference(moving.pixels, clicked.pixels, index) > 12) clickedSky++
      }
    }
    delete window.galaxyCaptures
    delete window.captureGalaxy
    return { changedSky, movingSky, clickedSky, coveredCharacter, changedCharacter, warp: clicked.warp, glErrors: [hidden.glError, normal.glError, moving.glError, clicked.glError] }
  })
  expect(checks.changedSky).toBeGreaterThan(1000)
  expect(checks.movingSky).toBeGreaterThan(1000)
  expect(checks.clickedSky).toBeGreaterThan(1000)
  expect(checks.warp).toBeGreaterThan(0.5)
  expect(checks.coveredCharacter).toBeGreaterThan(1000)
  expect(checks.changedCharacter).toBe(0)
  expect(checks.glErrors).toEqual([0, 0, 0, 0])
  await expect(page.locator('#canvas')).toHaveCount(1)
  await page.evaluate(() => window.world.loop.start())
  await page.evaluate(() => window.world.startExploring())
  await expectRendered.poll(() => page.evaluate(() => window.world.phase)).toBe('exploring')
  await page.mouse.click(180, 200)
  expect(await page.evaluate(() => window.world.galaxy.mesh.material.uniforms.uWarp.value)).toBe(0)
  await page.evaluate(() => window.unmount())
  expect(errors).toEqual([])
})
