import { test, expect } from '@playwright/test'
import { expectRendered } from './rendering.js'

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`real RobotExpressive welcome floats, greets and follows the cursor at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120000)
    const assets = [], errors = []
    page.on('request', request => { if (request.url().includes('/assets/models/')) assets.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/test/welcome-harness.html')
    await page.waitForFunction(() => window.harnessReady && window.intro)
    expect(assets.some(url => url.endsWith('/robot-expressive/RobotExpressive.glb'))).toBe(true)
    expect(assets.every(url => url.endsWith('/robot-expressive/RobotExpressive.glb'))).toBe(true)
    expect(await page.evaluate(() => window.intro.character.getObjectByProperty('isSkinnedMesh', true) !== undefined)).toBe(true)
    expect(await page.evaluate(() => window.intro.actions.size)).toBe(2)
    const y = await page.evaluate(() => window.intro.character.position.y)
    await expectRendered.poll(() => page.evaluate(initial => Math.abs(window.intro.character.position.y - initial), y)).toBeGreaterThan(0.01)
    await expectRendered.poll(() => page.evaluate(() => window.intro.currentAction.getClip().name), { timeout: 30000 }).toBe('Wave')
    await page.mouse.move(viewport.width * 0.9, viewport.height * 0.6)
    await expectRendered.poll(() => page.evaluate(() => window.intro.character.rotation.y - window.intro.previewRotation.y)).toBeGreaterThan(0.15)
    await page.locator('canvas').dispatchEvent('pointerleave')
    // Damping caps each simulation step at 80 ms. Software WebGL in CI can
    // render fewer frames in five wall-clock seconds than this return needs.
    await expectRendered.poll(() => page.evaluate(() => Math.abs(window.intro.character.rotation.y - window.intro.previewRotation.y))).toBeLessThan(0.01)
    await page.evaluate(() => { window.welcome.dispose(); window.welcome.dispose() })
    expect(await page.evaluate(() => window.intro.character.parent)).toBe(null)
    expect(await page.evaluate(() => window.intro.mixer.stats.actions.inUse)).toBe(0)
    expect(errors).toEqual([])
  })
}

test('real RobotExpressive welcome stays still with reduced motion, including its articulated pose', async ({ page }) => {
  test.setTimeout(120000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/test/welcome-harness.html')
  await page.waitForFunction(() => window.harnessReady && window.intro)
  const pose = () => page.evaluate(() => ({
    position: window.intro.character.position.toArray(), rotation: window.intro.character.rotation.toArray(),
    bones: window.intro.character.getObjectByProperty('isSkinnedMesh', true).skeleton.bones.map(bone => bone.quaternion.toArray()), time: window.intro.mixer.time,
  }))
  const before = await pose()
  await page.mouse.move(1150, 100)
  await page.waitForTimeout(400)
  expect(await pose()).toEqual(before)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectRendered.poll(() => page.evaluate(() => window.intro.mixer.time)).toBeGreaterThan(before.time)
  await page.evaluate(() => window.welcome.dispose())
})
