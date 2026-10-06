import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
const [url, output] = process.argv.slice(2)
if (!url || !output) throw new Error('Usage: node scripts/measure-world.mjs URL OUTPUT.json')
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] })
const runs = []
const memoryOnly = process.argv.includes('--memory-only')
const frames = memoryOnly ? 1 : 60
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const scripts = [], errors = []
    page.on('response', response => { if (/\.js(?:\?|$)/.test(response.url())) scripts.push(response.body().then(body => ({ bytes: body.length, gzip: gzipSync(body).length }))) })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('mimix-onboarding-v2', 'seen'))
    const start = performance.now()
    await page.goto(url)
    await page.locator('#canvas').waitFor({ state: 'visible' })
    await page.locator('#world-loading').waitFor({ state: 'detached', timeout: 90000 })
    const loadMs = performance.now() - start
    const stats = await page.evaluate(async frames => {
      let previous = null; const samples = []
      await new Promise(resolve => {
        function tick(now) { if (previous !== null) samples.push(now - previous); previous = now; if (samples.length === frames) resolve(); else globalThis.requestAnimationFrame(tick) }
        globalThis.requestAnimationFrame(tick)
      })
      const gl = globalThis.document.querySelector('canvas')?.getContext('webgl2') ?? globalThis.document.querySelector('[aria-label="Mundo 3D de Mimix"]')?.shadowRoot?.querySelector('canvas')?.getContext('webgl2')
      const debug = gl?.getExtension('WEBGL_debug_renderer_info')
      return { fps: frames > 1 ? 1000 / (samples.reduce((sum, value) => sum + value, 0) / samples.length) : null, heapBytes: performance.memory?.usedJSHeapSize, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, glbDecodedBytes: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.glb')).reduce((sum, entry) => sum + entry.decodedBodySize, 0), glbBytes: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.glb')).reduce((sum, entry) => sum + entry.encodedBodySize, 0) }
    }, frames)
    const cdp = await context.newCDPSession(page)
    await cdp.send('HeapProfiler.collectGarbage')
    const retained = await cdp.send('Runtime.getHeapUsage')
    const bodies = await Promise.all(scripts)
    const result = { loadMs, ...stats, retainedHeapBytes: retained.usedSize, retainedBackingBytes: retained.backingStorageSize, jsBytes: bodies.reduce((sum, body) => sum + body.bytes, 0), jsGzipBytes: bodies.reduce((sum, body) => sum + body.gzip, 0), errors }
    runs.push(result)
    console.log(JSON.stringify({ run, ...result }))
    if (!run && !memoryOnly) await page.screenshot({ path: output + '.png' })
    await context.close()
  }
  const median = key => runs.map(run => run[key]).sort((a, b) => a - b)[1]
  const medians = Object.fromEntries(['loadMs', 'fps', 'heapBytes', 'retainedHeapBytes', 'retainedBackingBytes', 'glbBytes', 'glbDecodedBytes', 'jsBytes', 'jsGzipBytes'].map(key => [key, median(key)]))
  await writeFile(output, JSON.stringify({ url, viewport: [1280, 800], frames, browser: browser.version(), runs, medians }, null, 2) + '\n')
} finally { await browser.close() }
