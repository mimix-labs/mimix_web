import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

test('space welcome renders a floating yellow title above the character and releases it on Play', async ({ page }) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount({ startInSpace: true }))
  const title = await page.evaluate(() => {
    const { engine, loop, wordmark } = window.world
    loop.stop()
    engine.render()
    const gl = engine.renderer.getContext()
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let yellow = 0
    // Before the title exists, this region is Galaxy; Wall-E is below it.
    for (let y = Math.floor(height * 0.08); y < height * 0.3; y++) {
      for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
        const i = ((height - 1 - y) * width + x) * 4
        if (pixels[i] > 150 && pixels[i + 1] > 95 && pixels[i + 2] < pixels[i + 1] * 0.45) yellow++
      }
    }
    const first = wordmark?.group.children.map(letter => letter.position.y)
    wordmark?.update(1.5, false)
    const moved = first?.some((y, i) => Math.abs(y - wordmark.group.children[i].position.y) > 0.015) ?? false
    loop.start()
    return { yellow, moved, glError: gl.getError() }
  })
  expect(title.yellow).toBeGreaterThan(1500)
  expect(title.moved).toBe(true)
  expect(title.glError).toBe(0)
  await page.evaluate(() => window.world.startExploring())
  await expectRendered.poll(() => page.evaluate(() => window.world.phase)).toBe('exploring')
  expect(await page.evaluate(() => window.world.wordmark.group.parent === null)).toBe(true)
  await page.evaluate(() => window.unmount())
  expect(errors).toEqual([])
})
