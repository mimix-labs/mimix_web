import { test, expect } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })
for (const id of ['mathematics', 'science']) {
  test(`catalog opens local ${id} with the licensed companion and no Classic dependency`, async ({ page }) => {
    test.setTimeout(120000)
    const requests: string[] = [], errors: string[] = []
    page.on('request', request => requests.push(request.url()))
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: {} }))
    await page.route('https://fonts.**', route => route.abort())
    await page.addInitScript(() => localStorage.setItem('mimix-challenge-help-seen', 'true'))
    await page.goto('/catalogo')
    await page.getByRole('link', { name: `Explorar ${id === 'mathematics' ? 'Matemáticas' : 'Ciencias'}` }).click()
    await expect(page).toHaveURL(new RegExp(`/challenges/${id}/?$`))
    expect(new URL(page.url()).origin).toBe('http://127.0.0.1:3100')
    await expect(page.locator('body')).toHaveAttribute('data-challenge-state', 'running', { timeout: 60000 })
    await expect(page.locator('#three-canvas canvas')).toBeVisible()
    expect(await page.evaluate(() => (document as Document & { featurePolicy: { allowsFeature(name: string): boolean } }).featurePolicy.allowsFeature('camera'))).toBe(true)
    if (id === 'mathematics') {
      await expect(page.locator('#robot-container canvas')).toBeVisible({ timeout: 30000 })
      await expect.poll(() => requests.some(url => url.endsWith('/robot-expressive/RobotExpressive.glb'))).toBe(true)
      await page.keyboard.press('Control+2')
      await page.keyboard.press('Control+0')
    }
    expect(requests.some(url => /walle\.glb|mimix-classic\.vercel\.app|localhost:5173/.test(url))).toBe(false)
    const help = page.getByRole('button', { name: 'Entendido', exact: true })
    if (await help.isVisible()) await help.click()
    await page.screenshot({ path: `test-results/robot-${id}-desktop.png` })
    expect(errors).toEqual([])
  })
}

test('the selected robot renders in welcome and world at desktop and mobile sizes', async ({ page, request }) => {
  test.setTimeout(120000)
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))
  await page.addInitScript(() => localStorage.setItem('mimix-onboarding-v2', 'seen'))
  await page.setViewportSize({ width: 1296, height: 800 })
  await page.goto('/')
  await expect(page.locator('.space-home')).toHaveAttribute('data-scene-state', 'ready')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.screenshot({ path: 'test-results/robot-welcome-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/robot-welcome-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1296, height: 800 })
  await page.getByRole('link', { name: 'Comenzar como invitado' }).click()
  await expect(page.locator('#play-state-announcement')).toContainText('Mundo listo', { timeout: 90000 })
  await page.screenshot({ path: 'test-results/robot-world-desktop.png' })
  expect(requests.some(url => url.endsWith('/robot-expressive/RobotExpressive.glb'))).toBe(true)
  expect(requests.some(url => url.includes('/walle/'))).toBe(false)
  expect((await request.get('/assets/models/walle/walle.glb')).status()).toBe(404)
})
