import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
const exec = promisify(execFile)
const image = process.env.MIMIX_TEST_IMAGE ?? 'mimix:ci'
const docker = (...args) => exec('docker', args, { maxBuffer: 8 * 1024 * 1024 })

test('production image migrates PostgreSQL, persists progress, restores backup and protects both HTTP runtimes', { timeout: 120000 }, async t => {
  const suffix = randomUUID().slice(0, 8), network = `mimix-learning-${suffix}`, pg = `${network}-pg`
  await docker('network', 'create', network)
  t.after(async () => { await docker('rm', '-f', pg).catch(() => {}); await docker('network', 'rm', network) })
  await docker('run', '-d', '--name', pg, '--network', network, '-e', 'POSTGRES_PASSWORD=test-only', 'postgres:17-alpine')
  for (let i = 0; ; i++) {
    try { await docker('exec', pg, 'pg_isready', '-U', 'postgres'); break } catch { if (i > 60) throw new Error('PostgreSQL did not become ready'); await new Promise(resolve => setTimeout(resolve, 250)) }
  }
  const url = `postgres://postgres:test-only@${pg}:5432/postgres`
  const cli = (...args) => docker('run', '--rm', '--network', network, '-e', `DATABASE_URL=${url}`, image, 'node', 'apps/api/dist/database/cli.js', ...args)
  await cli('migrate'); await cli('migrate')
  await cli('seed-campaigns'); await cli('seed-campaigns')
  const script = `
    import { Database } from './apps/api/dist/database/database.js';
    import { PostgresIdentityRepository } from './apps/api/dist/modules/identity/postgres.repository.js';
    import { LearningStore } from './apps/api/dist/modules/learning/store.js';
    import { CampaignStore } from './apps/api/dist/modules/campaigns/store.js';
    const db=new Database(process.env.DATABASE_URL), store=new LearningStore(db);
    try {
      const user=await new PostgresIdentityRepository(db).resolve({provider:'clerk',issuer:'https://test.clerk.accounts.dev',subject:'container',sessionId:'s'});
      const result=await store.create(user.id,{idempotencyKey:'11111111-1111-4111-8111-111111111111',challengeId:'science',challengeVersion:'1'});
      await store.append(user.id,result.attempt.id,{eventId:'22222222-2222-4222-8222-222222222222',sequence:2,type:'attempt_completed',payload:{}});
      const campaigns=new CampaignStore(db);
      const campaignAttempt=await campaigns.start(user.id,'official-intro','1.0.0','shapes',{idempotencyKey:'33333333-3333-4333-8333-333333333333'});
      await store.append(user.id,campaignAttempt.attempt.id,{eventId:'44444444-4444-4444-8444-444444444444',sequence:2,type:'attempt_completed',payload:{}});
      console.log(JSON.stringify({...await store.get(user.id,result.attempt.id),campaign:await campaigns.progress(user.id,'official-intro','1.0.0')}));
    } finally { await db.close(); }
  `
  const seeded = await docker('run', '--rm', '--network', network, '-e', `DATABASE_URL=${url}`, image, 'node', '--input-type=module', '-e', script)
  assert.equal(JSON.parse(seeded.stdout).progress.status, 'completed')
  assert.equal(JSON.parse(seeded.stdout).campaign.completedNodes, 1)
  assert.equal(JSON.parse(seeded.stdout).campaign.nodes[1].canStart, true)
  await cli('rebuild')
  // Dump to a file inside this disposable container, restore into a separate database.
  await docker('exec', pg, 'pg_dump', '-U', 'postgres', '-Fc', '-f', '/tmp/learning.dump', 'postgres')
  await docker('exec', pg, 'createdb', '-U', 'postgres', 'restored')
  await docker('exec', pg, 'pg_restore', '-U', 'postgres', '--exit-on-error', '-d', 'restored', '/tmp/learning.dump')
  const restored = await docker('exec', pg, 'psql', '-U', 'postgres', '-d', 'restored', '-Atc', 'SELECT status || chr(58) || last_sequence FROM attempt_progress')
  assert.deepEqual(restored.stdout.trim().split('\n'), ['completed:2', 'completed:2'])
  const ids = await docker('exec', pg, 'psql', '-U', 'postgres', '-d', 'restored', '-Atc', 'SELECT id FROM users')
  assert.equal(ids.stdout.trim(), JSON.parse(seeded.stdout).attempt.userId)
  const restoredUrl = new URL(url); restoredUrl.pathname = '/restored'
  const restoredProgress = await docker('run', '--rm', '--network', network, '-e', `DATABASE_URL=${restoredUrl.toString()}`, image, 'node', '--input-type=module', '-e', `
    import { Database } from './apps/api/dist/database/database.js';
    import { CampaignStore } from './apps/api/dist/modules/campaigns/store.js';
    const db=new Database(process.env.DATABASE_URL);
    try { console.log(JSON.stringify(await new CampaignStore(db).progress('${JSON.parse(seeded.stdout).attempt.userId}','official-intro','1.0.0'))); }
    finally { await db.close(); }
  `)
  assert.deepEqual(JSON.parse(restoredProgress.stdout), JSON.parse(seeded.stdout).campaign)
  for (const runtime of ['nest', 'express']) {
    const name = `${network}-${runtime}`
    await docker('run', '-d', '--name', name, '--network', network, '-p', '127.0.0.1::4000', '-e', `DATABASE_URL=${url}`, '-e', 'MIMIX_DATA_STORE=postgres', '-e', 'MIMIX_AUTH_MODE=clerk', '-e', `MIMIX_API_RUNTIME=${runtime}`, '-e', 'CLERK_SECRET_KEY=sk_test_fixture', '-e', 'CLERK_ISSUER=https://test.clerk.accounts.dev', '-e', 'CLERK_AUTHORIZED_PARTIES=https://learning.test', image)
    try {
      const port = (await docker('port', name, '4000/tcp')).stdout.trim().split(':').at(-1), base = `http://127.0.0.1:${port}`
      for (let i = 0; ; i++) {
        try { assert.equal((await fetch(base + '/api/health')).status, 200); break } catch { if (i > 80) throw new Error(`${runtime} did not start`); await new Promise(resolve => setTimeout(resolve, 250)) }
      }
      assert.equal((await fetch(base + '/api/learning/progress')).status, 401)
      assert.equal((await fetch(base + '/api/campaigns')).status, 401)
      const spec = await (await fetch(base + '/api/openapi.json')).json()
      assert.ok(spec.paths['/api/learning/attempts/{id}/events'])
      assert.ok(spec.paths['/api/campaigns/{id}/versions/{version}/progress'])
    } finally { await docker('rm', '-f', name) }
  }
})
