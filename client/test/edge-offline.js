import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.env.MIMIX_EDGE_URL || 'http://127.0.0.1:4080'
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === new URL(base).origin || ['blob:', 'data:'].includes(url.protocol)
      ? route.continue() : route.abort('internetdisconnected')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('#world-loading').waitFor({ state: 'hidden', timeout: 60000 })
  assert.equal(await page.locator('#canvas').count(), 1)
  // Exercise the packaged decoder even when current model exports are uncompressed.
  const wasmHeader = await page.evaluate(async () => {
    const response = await fetch('/vendor/draco/draco_decoder.wasm')
    return [...new Uint8Array(await response.arrayBuffer()).slice(0, 4)]
  })
  assert.deepEqual(wasmHeader, [0, 97, 115, 109], 'local decoder must be WASM, not the SPA fallback')
  for (const challenge of ['mathematics', 'science']) {
    await page.goto(`${base}/challenges/${challenge}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('body[data-challenge-state="running"][data-vision-source="robot"]').waitFor({ timeout: 15000 })
  }
  assert.deepEqual(errors, [])
  console.log('Offline cold browser: world and both challenges loaded with external requests blocked.')
} finally { await browser.close() }
