import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { HttpSecurityPolicy } from '../dist/security/policy.js'
import { parseEnvironment } from '../dist/config/environment.js'

const base = parseEnvironment({})
const config = { ...base, deviceSessionsEnabled: true, rateLimits: { ...base.rateLimits, anonymous: 2, machine: 2 } }
const token = () => `${randomBytes(32).toString('base64url')}.${randomBytes(32).toString('base64url')}`
const request = token => ({ method: 'GET', url: '/api/devices/self', ip: 'same-proxy', headers: { authorization: `Device ${token}` } })

test('random syntactically valid credentials cannot spend database lookups, including across token rotation', async () => {
  let lookups = 0
  const valid = token()
  const dependencies = {
    // Cryptographic admission is tested separately; this fixture isolates resource ordering.
    deviceAdmission: token => token === valid ? 'authenticated-token-fingerprint' : undefined,
    deviceCredential: async token => { lookups++; return token === valid ? 'server-session-id' : undefined },
  }
  const policy = new HttpSecurityPolicy(config, dependencies)
  for (let n = 0; n < 20; n++) await policy.authorize(request(token()))
  assert.equal(lookups, 0)
  assert.equal((await policy.authorize(request(valid))).status, undefined)
  assert.equal(lookups, 1)
  // A fresh replica has no positive-token cache to warm or anonymous budget to borrow.
  const replica = new HttpSecurityPolicy(config, dependencies)
  for (let n = 0; n < 20; n++) await replica.authorize(request(token()))
  assert.equal((await replica.authorize(request(valid))).status, undefined)
  assert.equal(lookups, 2)
})

test('verified device quota limits concurrent expensive lookups before they begin and stays isolated by token', async () => {
  let lookups = 0
  const first = token(), second = token()
  const policy = new HttpSecurityPolicy(config, {
    deviceAdmission: token => token === first || token === second ? token : undefined,
    deviceCredential: async token => { lookups++; return token === first ? 'session-one' : 'session-two' },
  })
  const responses = await Promise.all(Array.from({ length: 20 }, () => policy.authorize(request(first))))
  assert.equal(lookups, 2)
  assert.equal(responses.filter(r => r.status === 429).length, 18)
  assert.equal((await policy.authorize(request(second))).status, undefined)
  assert.equal(lookups, 3)
})
