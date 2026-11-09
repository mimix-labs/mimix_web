import { test, expect } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`real Wall-E welcome floats, greets and follows the cursor at ${viewport.width}px`, async ({ page }) => {
    const assets = [], errors = []
    page.on('request', request => { if (request.url().includes('/assets/models/')) assets.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/test/welcome-harness.html')
    await page.waitForFunction(() => window.harnessReady && window.intro)
    expect(assets.some(url => url.endsWith('/walle/walle.glb'))).toBe(true)
    expect(assets.every(url => url.endsWith('/walle/walle.glb'))).toBe(true)
    expect(await page.evaluate(() => Boolean(window.intro.character.getObjectByName('TORSO')))).toBe(true)
    expect(await page.evaluate(() => window.intro.actions.size)).toBe(0)
    const y = await page.evaluate(() => window.intro.character.position.y)
    await expect.poll(() => page.evaluate(initial => Math.abs(window.intro.character.position.y - initial), y)).toBeGreaterThan(0.01)
    await expect.poll(() => page.evaluate(() => Math.abs(window.intro.poseAnimator.rightArm.rotation.z))).toBeGreaterThan(0.3)
    await page.mouse.move(viewport.width * 0.9, viewport.height * 0.6)
    await expect.poll(() => page.evaluate(() => window.intro.character.rotation.y - window.intro.previewRotation.y)).toBeGreaterThan(0.15)
    await page.locator('canvas').dispatchEvent('pointerleave')
    await expect.poll(() => page.evaluate(() => Math.abs(window.intro.character.rotation.y - window.intro.previewRotation.y))).toBeLessThan(0.01)
    expect(await page.evaluate(() => window.intro.poseAnimator.wheels.every(wheel => wheel.rotation.x === 0))).toBe(true)
    await page.evaluate(() => { window.welcome.dispose(); window.welcome.dispose() })
    expect(await page.evaluate(() => window.intro.character.parent)).toBe(null)
    expect(await page.evaluate(() => window.intro.poseAnimator.rightArm.rotation.z)).toBe(0)
    expect(errors).toEqual([])
  })
}

test('real Wall-E welcome stays still with reduced motion, including its articulated pose', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/test/welcome-harness.html')
  await page.waitForFunction(() => window.harnessReady && window.intro)
  const pose = () => page.evaluate(() => ({
    position: window.intro.character.position.toArray(), rotation: window.intro.character.rotation.toArray(),
    arm: window.intro.poseAnimator.rightArm.rotation.toArray(), time: window.intro.poseAnimator.time,
  }))
  const before = await pose()
  await page.mouse.move(1150, 100)
  await page.waitForTimeout(400)
  expect(await pose()).toEqual(before)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.evaluate(() => window.intro.poseAnimator.time)).toBeGreaterThan(before.time)
  await page.evaluate(() => window.welcome.dispose())
})
