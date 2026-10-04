import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const issuer = 'https://test.clerk.accounts.dev'
const origin = 'https://mimix.test'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString()
function token(overrides = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const data = [ { alg: 'RS256', typ: 'JWT', kid: 'test' }, { sub: 'user_one', sid: 'sess_one', iss: issuer, azp: origin, iat: now, nbf: now - 1, exp: now + 60, ...overrides } ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`
}

async function authenticate(provider, value) {
  const identity = await provider.verifyToken(value)
  await provider.verifySession(identity)
  return identity
}

test('first signup, concurrent login and restart preserve internal UUID without email linking', async t => {
  const { FileIdentityRepository } = await import('../dist/modules/identity/identity.repository.js')
  const dir = mkdtempSync(join(tmpdir(), 'mimix-identity-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'identities.json')
  const repo = new FileIdentityRepository(file)
  const identity = { provider: 'clerk', issuer, subject: 'user_one', sessionId: 'sess_one' }
  const users = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve(repo.resolve(identity))))
  assert.match(users[0].id, /^[0-9a-f-]{36}$/)
  assert.ok(users.every(user => user.id === users[0].id))
  assert.equal(new FileIdentityRepository(file).resolve({ ...identity, sessionId: 'sess_two' }).id, users[0].id)
  assert.notEqual(repo.resolve({ ...identity, subject: 'user_two' }).id, users[0].id)
  assert.notEqual(repo.resolve({ ...identity, issuer: 'https://other.clerk.accounts.dev' }).id, users[0].id)
  writeFileSync(file, '{broken')
  assert.throws(() => new FileIdentityRepository(file))
})

test('Clerk adapter verifies real signatures, claims and live session before mapping', async () => {
  const { ClerkIdentityProvider } = await import('../dist/modules/identity/clerk.provider.js')
  let session = { id: 'sess_one', userId: 'user_one', status: 'active', expireAt: Date.now() + 60000 }
  const provider = new ClerkIdentityProvider({ secretKey: 'sk_test_placeholder', jwtKey, issuer, authorizedParties: [origin] }, { getSession: async () => session })
  assert.deepEqual(await authenticate(provider, token()), { provider: 'clerk', issuer, subject: 'user_one', sessionId: 'sess_one' })
  for (const claims of [{ exp: 1 }, { nbf: 9999999999 }, { iss: 'https://evil.test' }, { azp: 'https://evil.test' }, { azp: undefined }, { sid: undefined }, { sub: 'user_other' }, { sts: 'pending' }]) {
    await assert.rejects(authenticate(provider, token(claims)), /invalid session/)
  }
  await assert.rejects(authenticate(provider, 'invalid'), /invalid session/)
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  await assert.rejects(authenticate(provider, token({}, other.privateKey)), /invalid session/)
  session = { ...session, status: 'revoked' }
  await assert.rejects(authenticate(provider, token()), /invalid session/)
  session = { ...session, status: 'active', expireAt: 0 }
  await assert.rejects(authenticate(provider, token()), /invalid session/)
  const unavailable = new ClerkIdentityProvider({ secretKey: 'sk_test_placeholder', jwtKey, issuer, authorizedParties: [origin] }, { getSession: async () => { throw new Error('private service detail') } })
  await assert.rejects(authenticate(unavailable, token()), /identity unavailable/)
})

test('signed Clerk login reaches HTTP mapping and a revoked token cannot create another identity', async t => {
  const { createApi } = await import('../dist/app.js')
  const { parseEnvironment } = await import('../dist/config/environment.js')
  const { ClerkIdentityProvider } = await import('../dist/modules/identity/clerk.provider.js')
  const { readFileSync, statSync } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'mimix-signed-http-'))
  const file = join(dir, 'identity.json')
  let status = 'active'
  const provider = new ClerkIdentityProvider({ secretKey: 'sk_test_placeholder', jwtKey, issuer, authorizedParties: [origin] }, {
    getSession: async id => ({ id, userId: 'user_one', status, expireAt: Date.now() + 60000 }),
  })
  const config = parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_placeholder', CLERK_ISSUER: issuer, CLERK_AUTHORIZED_PARTIES: origin, MIMIX_IDENTITY_FILE: file })
  const app = await createApi(config, { provider })
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }) })
  await app.listen(0, '127.0.0.1')
  const base = await app.getUrl()
  const request = value => fetch(base + '/api/identity/me', { headers: { authorization: `Bearer ${value}` } })
  const login = await request(token())
  assert.equal(login.status, 200)
  assert.equal(login.headers.get('cache-control'), 'no-store')
  const first = await login.json()
  const users = await Promise.all(Array.from({ length: 12 }, () => request(token({ sid: 'sess_two' })).then(res => res.json())))
  assert.ok(users.every(user => user.id === first.id))
  status = 'revoked'
  assert.equal((await request(token())).status, 401)
  assert.equal((await request(token({ sub: 'user_other' }))).status, 401)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.users.length, 1)
  assert.equal(saved.identities.length, 1)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(JSON.stringify(saved).includes('sess_'), false)
})

test('corrupt, duplicate and orphan identity records never silently reassign users', async t => {
  const { FileIdentityRepository } = await import('../dist/modules/identity/identity.repository.js')
  const dir = mkdtempSync(join(tmpdir(), 'mimix-corrupt-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'users.json')
  const user = { id: 'f4a7d5fc-7e00-47b2-a547-d6e929089551', createdAt: '2026-10-04T00:00:00Z' }
  const identity = { id: 'ac69f747-d04c-42e5-a2eb-19bc6a7b113a', userId: user.id, provider: 'clerk', issuer, subject: 'user_one' }
  for (const snapshot of [
    { version: 2, users: [], identities: [] },
    { version: 1, users: [user, user], identities: [] },
    { version: 1, users: [], identities: [identity] },
    { version: 1, users: [user], identities: [identity, { ...identity, subject: 'user_other' }] },
  ]) {
    writeFileSync(file, JSON.stringify(snapshot))
    assert.throws(() => new FileIdentityRepository(file))
  }
})
