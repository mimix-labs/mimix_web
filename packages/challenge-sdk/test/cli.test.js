import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
const valid = {
  schemaVersion: 1, apiVersion: 1, id: 'test', version: '1.0.0', title: 'Test', description: 'Test',
  entrypoint: 'index.js', objectives: [{ id: 'one', description: 'One' }],
  completion: { description: 'Done' }, capabilities: { required: ['progress'], optional: [] },
}

test('CLI validates fixture with structured output', () => {
  const result = run(fileURLToPath(new URL('../fixtures/minimal/manifest.json', import.meta.url)))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).ok, true)
})

test('CLI exit codes and entrypoint containment, without executing code', t => {
  const root = mkdtempSync(join(tmpdir(), 'mimix-sdk-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const manifest = join(root, 'manifest.json')
  const entry = join(root, 'index.js')
  assert.equal(run().status, 2)
  assert.equal(run(manifest, 'extra').status, 2)
  assert.equal(run(manifest).status, 2)
  writeFileSync(manifest, '{bad')
  assert.equal(run(manifest).status, 1)
  writeFileSync(manifest, JSON.stringify({ ...valid, apiVersion: 7 }))
  assert.equal(JSON.parse(run(manifest).stdout).error.code, 'UNSUPPORTED_VERSION')
  writeFileSync(manifest, JSON.stringify(valid))
  assert.equal(run(manifest).status, 1)
  writeFileSync(entry, 'throw new Error("CLI must never import this file")')
  assert.equal(run(manifest).status, 0)
  rmSync(entry)
  symlinkSync(cli, entry)
  assert.equal(run(manifest).status, 1, 'symlink escaping manifest root must be rejected')
  rmSync(entry)
  symlinkSync(root, entry)
  assert.equal(run(manifest).status, 1, 'directory is not an entrypoint')
})
