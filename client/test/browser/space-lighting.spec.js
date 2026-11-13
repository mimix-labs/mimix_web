import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

test('space lighting reaches RobotExpressive and the title, preserves Galaxy and restores map materials after Play', async ({ page }) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount({ startInSpace: true }))
  const pixels = await page.evaluate(() => {
    const { engine, galaxy, wordmark, spaceLighting: lighting, loop } = window.world
    loop.stop()
    engine.controls.enableDamping = false
    galaxy.setInteractive(false)
    galaxy.setInteractive(true)
    window.savedSpaceMaterials = lighting.originals.map(({ mesh, material }) => ({ mesh, material, preview: mesh.material }))
    const gl = engine.renderer.getContext()
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
    const capture = (enabled, warp = 0) => {
      lighting.setTransitionProgress(enabled ? 0 : 1)
      for (const { mesh, material, preview } of window.savedSpaceMaterials) mesh.material = enabled ? preview : material
      lighting.update(warp)
      wordmark.update(0, false, warp)
      engine.render()
      const result = new Uint8Array(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result)
      return result
    }
    const before = capture(false), lit = capture(true), pulse = capture(true, 1)
    let litBody = 0, pulsingBody = 0, litTitle = 0, pulsingTitle = 0, coolTitle = 0, changedOutside = 0
    const delta = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    for (let i = 0; i < before.length; i += 4) {
      const x = i / 4 % width, y = height - Math.floor(i / 4 / width)
      const inTitle = x >= width * 0.2 && x <= width * 0.8 && y >= height * 0.04 && y <= height * 0.27
      const inBody = x >= width * 0.3 && x <= width * 0.7 && y >= height * 0.27 && y <= height * 0.75
      if (inTitle && pulse[i + 2] > 65 && pulse[i + 2] > pulse[i] * 1.2 && pulse[i + 2] > pulse[i + 1] * 1.15 && delta(lit, pulse, i) > 3) coolTitle++
      // Both foreground objects should react; the surrounding Galaxy should not.
      if (!inTitle && !inBody) {
        if (delta(before, lit, i) > 6) changedOutside++
      } else if (inTitle && lit[i] > 150 && lit[i + 1] > 95 && lit[i + 2] < lit[i + 1] * 0.45) {
        if (delta(before, lit, i) > 6) litTitle++
        if (delta(lit, pulse, i) > 3) pulsingTitle++
      } else if (inBody) {
        if (delta(before, lit, i) > 12) litBody++
        if (delta(lit, pulse, i) > 3) pulsingBody++
      }
    }
    lighting.update(0)
    loop.start()
    return { litBody, pulsingBody, litTitle, pulsingTitle, coolTitle, changedOutside, glError: gl.getError(), steady: lighting.rim.intensity }
  })
  expect(pixels.litBody).toBeGreaterThan(1000)
  expect(pixels.pulsingBody).toBeGreaterThan(100)
  expect(pixels.litTitle).toBeGreaterThan(500)
  expect(pixels.pulsingTitle).toBeGreaterThan(100)
  expect(pixels.coolTitle).toBeGreaterThan(100)
  expect(pixels.changedOutside).toBe(0)
  expect(pixels.glError).toBe(0)
  await page.mouse.click(180, 200)
  await expectRendered.poll(() => page.evaluate(() => window.world.spaceLighting.rim.intensity)).toBeGreaterThan(pixels.steady + 0.1)
  await page.evaluate(() => window.world.startExploring())
  await expectRendered.poll(() => page.evaluate(() => window.world.phase)).toBe('exploring')
  expect(await page.evaluate(() => window.savedSpaceMaterials.every(({ mesh, material }) => mesh.material === material))).toBe(true)
  expect(await page.evaluate(() => window.world.spaceLighting.rig.parent === null)).toBe(true)
  await page.evaluate(() => { delete window.savedSpaceMaterials; window.unmount() })
  expect(errors).toEqual([])
})
