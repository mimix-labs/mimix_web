import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

test('account overlay can freeze and resume the existing world and safely restore a captured view', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/test/world-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  await page.evaluate(() => window.mount())
  const before = await page.evaluate(() => {
    window.world.setInteractionEnabled(false)
    return window.world.captureView()
  })
  await page.keyboard.down('KeyW')
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.world.captureView())).toEqual(before)
  expect(await page.evaluate(() => window.world.loop._running)).toBe(false)
  await page.keyboard.up('KeyW')
  expect(await page.evaluate(() => window.world.restoreView({ position: [400, 0, 400], rotation: 0, camera: [6, 7, 6], target: [0, 0, 0] }))).toBe(false)
  expect(await page.evaluate(view => window.world.restoreView(view), before)).toBe(true)
  await page.evaluate(() => window.world.setInteractionEnabled(true))
  const z = before.position[2]
  await page.keyboard.down('KeyW')
  await expectRendered.poll(() => page.evaluate(() => window.world.captureView().position[2])).toBeLessThan(z)
  await page.keyboard.up('KeyW')
  await page.evaluate(() => window.unmount())
})
