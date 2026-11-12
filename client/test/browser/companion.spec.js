import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

test('activity companion respects reduced motion, resumes, returns to Idle and releases its canvas', async ({ page }) => {
  test.setTimeout(120000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/test/companion-harness.html')
  await page.waitForFunction(() => window.harnessReady)
  const time = await page.evaluate(() => window.robotManager.robot.mixer.time)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.robotManager.robot.mixer.time)).toBe(time)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectRendered.poll(() => page.evaluate(() => window.robotManager.robot.mixer.time)).toBeGreaterThan(time)
  expect(await page.evaluate(() => {
    const manager = window.robotManager
    manager.like(); manager.robot.mixer.update(0.5)
    manager.like(); manager.robot.mixer.update(4)
    return manager.getCurrentState()
  })).toBe('Idle')
  await page.evaluate(() => window.robotManager.wave())
  await expectRendered.poll(() => page.evaluate(() => window.robotManager.getCurrentState())).toBe('Idle')
  await page.evaluate(() => window.robotManager.idle())
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.robotManager.activeTimeouts.length)).toBe(0)
  await page.evaluate(() => { window.robotManager.dispose(); window.robotManager.dispose() })
  await expect(page.locator('canvas')).toHaveCount(0)
})
