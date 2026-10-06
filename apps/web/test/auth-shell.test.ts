import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'

// Real Clerk middleware and auth(), only the remote Mimix HTTP API is a fixture.
// No alternate production auth path and no external Clerk account required.
test('standalone Clerk session reaches private SSR, isolates users and fails closed', { timeout: 30000 }, async t => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const issuer = 'https://clerk.mimix.test'
  function jwt(sub: string, lifetime = 300) {
    const now = Math.floor(Date.now() / 1000)
    const data = [{ alg: 'RS256', typ: 'JWT', kid: 'test' }, { sub, sid: `sess_${sub}`, iss: issuer, azp: 'http://127.0.0.1', iat: now, nbf: now - 1, exp: now + lifetime, v: 2, fva: [0, -1] }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`
  }
  const alice = jwt('user_alice'), bob = jwt('user_bob')
  const aliceId = '11111111-1111-4111-8111-111111111111', bobId = '22222222-2222-4222-8222-222222222222'
  let revoked = false
  const calls: string[] = []
  const api = createServer((req, res) => {
    const token = req.headers.authorization?.slice(7)
    if (revoked || ![alice, bob].includes(token ?? '')) { res.writeHead(401); res.end('{}'); return }
    calls.push(req.url ?? '')
    const id = token === alice ? aliceId : bobId
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url?.startsWith('/api/identity/me') ? { id, createdAt: '2026-10-05T00:00:00Z' } : { items: [{ attempt: { id, challengeId: token === alice ? 'science' : 'mathematics', challengeVersion: '1.0.0', createdAt: '2026-10-05T00:00:00Z' }, progress: { attemptId: id, status: 'active', lastSequence: 1, answers: 0, correctAnswers: 0, hints: 0 } }], nextCursor: req.url?.includes('after=') ? null : id }))
  })
  api.listen(0, '127.0.0.1'); await once(api, 'listening')
  t.after(() => api.close())
  const apiAddress = api.address(); assert.ok(apiAddress && typeof apiAddress !== 'string')
  const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening')
  const address = probe.address(); assert.ok(address && typeof address !== 'string')
  await new Promise<void>(resolve => probe.close(() => resolve()))
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(address.port), HOSTNAME: '127.0.0.1', MIMIX_WEB_AUTH_MODE: 'clerk', MIMIX_API_ORIGIN: `http://127.0.0.1:${apiAddress.port}`, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from('clerk.mimix.test$').toString('base64')}`, CLERK_SECRET_KEY: 'sk_live_fixture', CLERK_JWT_KEY: jwtKey }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { output += value })
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGKILL'); await once(child, 'exit') } })
  const base = `http://127.0.0.1:${address.port}`
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base + '/healthz')).ok) { ready = true; break } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, output)
  const request = (path: string, token?: string) => fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {}, redirect: 'manual', signal: AbortSignal.timeout(8000) })
  const anonymous = await request('/perfil')
  assert.equal(anonymous.status, 307, await anonymous.text())
  assert.equal(new URL(anonymous.headers.get('location')!, base).pathname, '/acceso')
  for (const [token, own, other] of [[alice, aliceId, bobId], [bob, bobId, aliceId]]) {
    const response = await request('/perfil', token)
    const html = await response.text()
    assert.equal(response.status, 200, html + output)
    assert.ok(html.includes(own), html + output)
    assert.ok(!html.includes(other))
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.ok(!html.includes(token))
  }
  const cookieProfile = await fetch(base + '/perfil', { headers: { cookie: `__session=${alice}; __client_uat=${Math.floor(Date.now() / 1000) - 5}` }, signal: AbortSignal.timeout(8000) })
  assert.ok((await cookieProfile.text()).includes(aliceId))
  const beforeInvalid = calls.length
  for (const invalid of ['not-a-jwt', jwt('user_expired', -60)]) {
    const response = await request('/perfil', invalid)
    assert.equal(response.status, 307)
  }
  assert.equal(calls.length, beforeInvalid)
  const progress = await (await request('/progreso', alice)).text()
  assert.ok(progress.includes('Ciencias'))
  assert.ok(progress.includes(`/progreso?after=${aliceId}`))
  await request(`/progreso?after=${aliceId}`, alice).then(res => res.text())
  assert.ok(calls.includes(`/api/learning/progress?after=${aliceId}`))
  revoked = true
  const expired = await (await request('/perfil', alice)).text()
  assert.ok(expired.includes('Tu sesión ha vencido'))
  assert.ok(!expired.includes(aliceId))
  assert.ok(!output.includes(alice))
})
