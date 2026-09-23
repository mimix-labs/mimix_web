import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const criticalPages = [
  ['client/index.html', 'id="canvas"'],
  ['client/public/challenges/mathematics/index.html', '<title>'],
  ['client/public/challenges/science/index.html', '<title>'],
]

for (const [file, marker] of criticalPages) {
  test(`${file} keeps its critical shell`, async () => {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')

    assert.match(html, /<!DOCTYPE html>/i)
    assert.ok(html.includes(marker), `expected ${file} to contain ${marker}`)
  })
}
