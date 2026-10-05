import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import test from 'node:test'
import * as tokens from '../dist/modules/devices/tokens.js'

test('device admission survives replicas and verifies the whole token without PostgreSQL', () => {
  const key = randomBytes(32).toString('base64url')
  const issuer = new tokens.DeviceTokens(key), replica = new tokens.DeviceTokens(key)
  const first = issuer.issue(), second = issuer.issue()
  assert.match(first, /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
  assert.ok(replica.identity(first))
  assert.equal(replica.identity(first), issuer.identity(first))
  assert.notEqual(replica.identity(first), replica.identity(second))
  assert.equal(new tokens.DeviceTokens(randomBytes(32).toString('base64url')).identity(first), undefined)
  const [nonce, signature] = first.split('.')
  for (const token of [nonce, `${nonce}.${second.split('.')[1]}`, `${second.split('.')[0]}.${signature}`, `${nonce}.${randomBytes(32).toString('base64url')}`, `${first}=`, `${first}.extra`]) {
    assert.equal(replica.identity(token), undefined)
  }
  // Noncanonical base64 aliases must not select new quota buckets for the same MAC bytes.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const alias = signature.slice(0, -1) + alphabet[alphabet.indexOf(signature.at(-1)) + 1]
  assert.equal(replica.identity(`${nonce}.${alias}`), undefined)
  const otherPurpose = createHmac('sha256', Buffer.from(key, 'base64url')).update(nonce).digest('base64url')
  assert.equal(replica.identity(`${nonce}.${otherPurpose}`), undefined)
})

test('admission key requires canonical 32-byte entropy input and never exposes it on rejection', () => {
  for (const key of ['', 'private-invalid-key', randomBytes(16).toString('base64url'), 'x'.repeat(44)]) {
    assert.throws(() => new tokens.DeviceTokens(key), error => error.message === 'invalid device token key')
  }
})
