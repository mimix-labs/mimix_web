import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
test('standalone container serves routes, static chunks and health without the build tree', async t => {
  const id = docker('run', '-d', '--rm', '-p', '127.0.0.1::3100', '-e', 'MIMIX_WEB_AUTH_MODE=disabled', '-e', 'MIMIX_LEGACY_ORIGIN=https://legacy.example.com', 'mimix-web:ci')
  t.after(() => docker('stop', id))
  const port = docker('port', id, '3100/tcp').split(':').at(-1)
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`${base}/healthz`)).ok) { ready = true; break } } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.equal(ready, true, 'container starts')
  assert.equal(docker('exec', id, 'id', '-u'), '1000')
  const health = await fetch(`${base}/healthz`)
  assert.deepEqual(await health.json(), { status: 'ok', service: 'mimix-web' })
  for (const path of ['/', '/catalogo', '/acceso']) assert.equal((await fetch(base + path)).status, 200)
  const home = await (await fetch(base)).text()
  assert.ok(home.includes('https://legacy.example.com'))
  const chunks = [...home.matchAll(/src="([^" ]*\/_next\/[^" ]+\.js)"/g)].map(match => match[1])
  assert.ok(chunks.length > 0)
  for (const chunk of chunks) assert.equal((await fetch(new URL(chunk, base))).status, 200)
  const privatePage = await fetch(`${base}/perfil`, { redirect: 'manual' })
  assert.equal(privatePage.status, 307)
  const destination = new URL(privatePage.headers.get('location'), base)
  assert.equal(destination.pathname, '/acceso')
  assert.equal(destination.origin, base)
})
