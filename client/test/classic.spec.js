import { test, expect } from '@playwright/test'

function track(page) {
  const api = [], errors = [], failed = []
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.url()) })
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', r => failed.push(`${r.url()}: ${r.failure()?.errorText}`))
  return () => { expect(api).toEqual([]); expect(errors).toEqual([]); expect(failed).toEqual([]) }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['mimix-onboarding-v2', 'mimix-mathematics-hand-guide-v2', 'mimix-science-hand-guide-v2']) localStorage.setItem(key, 'seen')
  })
})

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`classic world loads its original map, Wall-E and help on ${name} without an API`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const clean = track(page)
    await page.goto('/')
    await expect(page.locator('#world-loading')).toHaveCount(0, { timeout: 60000 })
    await expect(page.locator('#canvas')).toBeVisible()
    await expect(page.locator('#mimix-robot-button')).toHaveCount(0)
    await page.getByRole('button', { name: 'Abrir guía de uso' }).click()
    await expect(page.getByRole('heading', { name: 'Mueve a Wall-E' })).toBeVisible()
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.getByRole('button', { name: 'Comenzar' }).click()
    await expect(page.locator('#mimix-help')).not.toBeVisible()
    await page.keyboard.press('ArrowUp')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../test-results/classic-world-${name}.png` })
    clean()
  })
}

async function cameraReady(page, path) {
  const model = page.waitForResponse(r => r.url().endsWith('/hand_landmarker.task') && r.ok())
  await page.goto(path + '?vision=robot')
  await expect(page.locator('body')).toHaveAttribute('data-vision-source', 'browser')
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && document.querySelector('video').currentTime > 0)
  await model
}

test('mathematics uses the local webcam and can change shapes without posting events', async ({ page }) => {
  const clean = track(page)
  await cameraReady(page, '/challenges/mathematics/index.html')
  await expect(page.locator('#three-canvas canvas')).toBeVisible()
  const selected = await page.evaluate(async () => {
    const scene = await import('/challenges/mathematics/threeScene.js')
    scene.setMainShape('piramide')
    window.io().emit('lenvantarceja', { tipo: 'A' })
    return scene.currentShape
  })
  expect(selected).toBe('piramide')
  await page.screenshot({ path: '../test-results/classic-mathematics.png' })
  clean()
})

test('science opens atoms and changes electron counts with the local webcam and no backend', async ({ page }) => {
  const clean = track(page)
  await cameraReady(page, '/challenges/science/index.html')
  await expect(page.locator('button.element-cell')).toHaveCount(118)
  await page.locator('[data-symbol="Mg"]').click()
  await expect(page.locator('#atom-focus')).toBeVisible()
  await expect(page.locator('#atom-electrons')).toHaveText('12')
  await page.locator('#atom-charge-up').click()
  await expect(page.locator('#atom-electrons')).toHaveText('11')
  await page.screenshot({ path: '../test-results/classic-science.png' })
  await page.locator('#atom-back').click()
  await expect(page.locator('#atom-focus')).not.toBeVisible()
  clean()
})
