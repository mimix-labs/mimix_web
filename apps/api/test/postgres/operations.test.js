import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fixture } from './support.js'
const exec = promisify(execFile)
test('operator CLI migrates, imports and exports UUID-preserving snapshots and rebuilds progress', async t => {
  const f = await fixture(t), dir = await mkdtemp(join(tmpdir(), 'mimix-ops-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const cli = (...args) => exec(process.execPath, [new URL('../../dist/database/cli.js', import.meta.url).pathname, ...args], { env: { ...process.env, DATABASE_URL: f.url } })
  const snapshot = { version: 1, users: [{ id: randomUUID(), createdAt: '2026-10-04T00:00:00.000Z' }], identities: [] }
  const input = join(dir, 'input.json'), output = join(dir, 'output.json')
  await writeFile(input, JSON.stringify(snapshot))
  await cli('migrate'); await cli('migrate')
  await cli('import-identities', input); await cli('import-identities', input)
  const creation = await f.store.create(snapshot.users[0].id, { idempotencyKey: randomUUID(), challengeId: 'math', challengeVersion: '1' })
  await f.database.pool.query('DELETE FROM attempt_progress')
  await cli('rebuild')
  assert.equal((await f.store.get(snapshot.users[0].id, creation.attempt.id)).progress.lastSequence, 1)
  await cli('export-identities', output)
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), snapshot)
  assert.equal((await stat(output)).mode & 0o777, 0o600)
  await assert.rejects(cli('export-identities', output), error => { assert.equal(error.stderr.includes(f.url), false); return true })
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), snapshot)
  await assert.rejects(cli('invalid-command'))
})

test('Turbo dev forwards injected PostgreSQL configuration and starts the API', { timeout: 20000 }, async t => {
  const { createServer } = await import('node:net')
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve))
  const child = spawn('pnpm', ['exec', 'turbo', 'run', 'dev', '--filter=@mimix/api'], {
    cwd: new URL('../../../../', import.meta.url), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: process.env.MIMIX_TEST_DATABASE_URL, MIMIX_DATA_STORE: 'postgres', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://dev.test', CLERK_AUTHORIZED_PARTIES: 'https://dev.test', PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'silent' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM'); await stopped } })
  for (let i = 0; i < 120; i++) {
    assert.equal(output.includes('startup-failed'), false, output)
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).status === 200) return } catch { /* Wait for actual listening socket. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail(`Development API did not start: ${output}`)
})
