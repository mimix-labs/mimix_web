import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
for (const [route, heading] of [['/inicio-anterior', 'Un mundo de Matemáticas y Ciencias'], ['/catalogo', 'Explora los retos']]) {
  test(`${route} is accessible without Clerk or API, including mobile`, async ({ page }) => {
    const scripts: Promise<Buffer>[] = []
    page.on('response', response => { if (response.url().includes('/_next/') && response.url().endsWith('.js')) scripts.push(response.body()) })
    const requests: string[] = []
    page.on('request', request => requests.push(request.url()))
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    if (route === '/inicio-anterior') await expect(page.getByRole('link', { name: 'Abrir el mundo 3D' })).toHaveAttribute('href', '/mundo')
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    await page.setViewportSize({ width: 360, height: 780 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(requests.some(url => /\.glb|mediapipe|draco|clerk\.accounts/.test(url))).toBe(false)
    const bodies = await Promise.all(scripts)
    const gzipBytes = bodies.reduce((sum, body) => sum + gzipSync(body).length, 0)
    console.info(`Bundle ${route}: ${bodies.length} scripts, ${gzipBytes} gzip bytes`)
    expect(gzipBytes).toBeLessThan(350_000)
    await page.screenshot({ path: `test-results/${route.replaceAll('/', '') || 'inicio'}-mobile.png`, fullPage: true })
  })
}
test('private routes fail closed without identity and never fetch private data', async ({ page }) => {
  for (const route of ['/perfil', '/progreso', '/progreso?after=invalid']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/acceso$/)
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Seguir como invitado' })).toHaveAttribute('href', '/mundo')
  }
})
test('catalog keeps the original challenge entrypoints and home enters the educational world', async ({ page }) => {
  await page.goto('/catalogo')
  await expect(page.getByRole('link', { name: 'Explorar Matemáticas' })).toHaveAttribute('href', '/challenges/mathematics/')
  await expect(page.getByRole('link', { name: 'Explorar Ciencias' })).toHaveAttribute('href', '/challenges/science/')
  await page.getByRole('link', { name: 'MIMIX', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Comenzar como invitado' })).toHaveAttribute('href', '/mundo')
  const response = await page.goto('/no-existe')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible()
})
