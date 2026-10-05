import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateManifest } from '../../packages/challenge-sdk/dist/index.js'

for (const id of ['mathematics', 'science']) {
  test(`${id} ships a validated versioned SDK entrypoint and replay fixture`, async () => {
    const root = new URL(`../../packages/challenge-${id}/`, import.meta.url)
    const manifest = await readFile(new URL('src/manifest.json', root), 'utf8').then(JSON.parse).catch(() => null)
    assert.ok(manifest, 'official manifest must exist')
    const parsed = validateManifest(manifest)
    assert.equal(parsed.ok, true)
    assert.equal(manifest.id, id)
    assert.equal(manifest.version, '1.0.0')
    const builtManifest = JSON.parse(await readFile(new URL('dist/manifest.json', root), 'utf8'))
    assert.deepEqual(builtManifest, manifest)
    const entry = await import(new URL(`dist/${builtManifest.entrypoint}`, root).href)
    assert.equal(typeof entry.createChallenge, 'function')
    const controller = new AbortController()
    const instance = entry.createChallenge({ signal: controller.signal, capabilities: [], mimix: {} })
    for (const hook of ['initialize','start','pause','resume','dispose']) assert.equal(typeof instance[hook], 'function')
    await instance.dispose() // Must be safe without initialization or DOM.
    await instance.dispose()
    const fixture = JSON.parse(await readFile(new URL('fixtures/parity.json', root), 'utf8'))
    assert.equal(fixture.challenge, id)
    assert.ok(fixture.selections.length >= 2)
  })
}
