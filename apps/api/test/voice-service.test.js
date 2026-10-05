import assert from 'node:assert/strict'
import test from 'node:test'
import * as module from '../dist/modules/voice/service.js'
import * as fake from '../dist/modules/voice/fake.js'
import { parseEnvironment } from '../dist/config/environment.js'
const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const input = { schemaVersion: 1, id: '33333333-3333-4333-8333-333333333333', text: 'Texto privado' }
const next = { ...input, id: '44444444-4444-4444-8444-444444444444' }
const limits = { timeoutMs: 1000, maxConcurrent: 4, requestsPerMinute: 6, charactersPerMinute: 3000, charactersPerDay: 50000 }
const mp3 = { contentType: 'audio/mpeg', bytes: new Uint8Array([73, 68, 51, 0]) }
const turn = (service, request = input, userId = user, signal) => service.speak(userId, request, signal)

test('voice config defaults off and enabling requires Clerk, key, safe voice and explicit retention', () => {
  assert.ok(parseEnvironment({}).voice)
  assert.equal(parseEnvironment({}).voice.provider, 'disabled')
  const env = { MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://mimix.test', MIMIX_IDENTITY_FILE: '/unused/users.json', MIMIX_VOICE_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'private-fixture', ELEVENLABS_VOICE_ID: 'JBFqnCBsd6RMkjVDRZzb', MIMIX_VOICE_RETENTION: 'zero' }
  assert.equal(parseEnvironment(env).voice.retention, 'zero')
  for (const patch of [{ MIMIX_AUTH_MODE: 'legacy' }, { ELEVENLABS_API_KEY: '' }, { ELEVENLABS_VOICE_ID: '../secret' }, { MIMIX_VOICE_RETENTION: undefined }, { MIMIX_VOICE_TIMEOUT_MS: '0' }, { MIMIX_VOICE_MAX_CONCURRENT: '33' }]) {
    assert.throws(() => parseEnvironment({ ...env, ...patch }), error => error.message.startsWith('Invalid configuration:') && !error.message.includes('private-fixture'))
  }
})

test('fake provider is deterministic and disabled/error paths retain exact subtitles without audio', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  assert.equal(typeof fake.FakeVoiceProvider, 'function')
  const service = new module.VoiceService(new fake.FakeVoiceProvider(), limits)
  const ready = await turn(service)
  assert.equal(ready.status, 'ready'); assert.equal(ready.subtitle, input.text)
  assert.equal(ready.audio.base64, 'SUQzAA==')
  assert.equal((await turn(new module.VoiceService(undefined, limits))).reason, 'DISABLED')
  const failed = await turn(new module.VoiceService({ synthesize: async () => { throw new Error('secret-key') } }, limits))
  assert.equal(failed.reason, 'PROVIDER_UNAVAILABLE'); assert.equal(failed.subtitle, input.text)
  assert.equal('audio' in failed, false); assert.equal(JSON.stringify(failed).includes('secret-key'), false)
})

test('new utterance interrupts same user only and late completion cannot replace current request', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  const pending = []
  const service = new module.VoiceService({ synthesize: (text, { signal }) => new Promise(resolve => pending.push({ resolve, signal, text })) }, limits)
  const a = turn(service); const b = turn(service, input, other); const c = turn(service, next)
  await Promise.resolve()
  assert.equal((await a).reason, 'INTERRUPTED')
  assert.equal(pending[0].signal.aborted, true)
  assert.equal(pending[1].signal.aborted, false)
  pending[0].resolve(mp3)
  assert.equal(service.cancel(other, next.id), false)
  assert.equal(service.cancel(user, input.id), false)
  pending[1].resolve(mp3); pending[2].resolve(mp3)
  assert.equal((await b).status, 'ready'); assert.equal((await c).status, 'ready')
})

test('cancel, disconnect, shutdown and timeout finish even if the provider ignores abort', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  for (const action of ['cancel', 'disconnect', 'shutdown', 'timeout']) {
    let signal
    const service = new module.VoiceService({ synthesize: (_text, options) => { signal = options.signal; return new Promise(() => {}) } }, { ...limits, timeoutMs: 10 })
    const client = new AbortController()
    const result = turn(service, input, user, client.signal)
    await Promise.resolve()
    if (action === 'cancel') assert.equal(service.cancel(user, input.id), true)
    if (action === 'disconnect') client.abort()
    if (action === 'shutdown') service.close()
    const response = await result
    assert.equal(response.reason, action === 'timeout' ? 'TIMEOUT' : 'CANCELLED')
    assert.equal(signal.aborted, true)
  }
})

test('quota reservations are atomic, failures are charged and windows expire deterministically', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  let now = 0, calls = 0
  const provider = { synthesize: async () => { calls++; throw new Error('failure') } }
  const service = new module.VoiceService(provider, { ...limits, requestsPerMinute: 1, charactersPerDay: input.text.length * 2 }, () => now)
  assert.equal((await turn(service)).reason, 'PROVIDER_UNAVAILABLE')
  assert.equal((await turn(service, next)).reason, 'QUOTA_EXCEEDED')
  now = 60000
  assert.equal((await turn(service, next)).reason, 'PROVIDER_UNAVAILABLE')
  now = 120000
  assert.equal((await turn(service, next, other)).reason, 'QUOTA_EXCEEDED')
  assert.equal(calls, 2)
  now = 86400000
  assert.equal((await turn(service)).reason, 'PROVIDER_UNAVAILABLE')
  const chars = new module.VoiceService(provider, { ...limits, charactersPerMinute: 1 })
  assert.equal((await turn(chars)).reason, 'QUOTA_EXCEEDED')
})

test('concurrency is bounded and quota-denied replacements do not interrupt accepted work', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  const signals = []
  const provider = { synthesize: (_text, { signal }) => { signals.push(signal); return new Promise(() => {}) } }
  const service = new module.VoiceService(provider, { ...limits, maxConcurrent: 1 })
  const running = turn(service)
  await Promise.resolve()
  assert.equal((await turn(service, input, other)).reason, 'BUSY')
  assert.equal(signals[0].aborted, false)
  service.close(); await running

  const quotaService = new module.VoiceService(provider, { ...limits, maxConcurrent: 2, requestsPerMinute: 1 })
  const accepted = turn(quotaService)
  await Promise.resolve()
  assert.equal((await turn(quotaService, next)).reason, 'QUOTA_EXCEEDED')
  assert.equal(signals[1].aborted, false)
  quotaService.close(); await accepted
})

test('same-user replacements cannot exceed physical provider concurrency when abort is ignored', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  let calls = 0
  const service = new module.VoiceService({ synthesize: async () => { calls++; return new Promise(() => {}) } }, { ...limits, maxConcurrent: 1, requestsPerMinute: 20 })
  const running = turn(service)
  await Promise.resolve()
  for (let index = 0; index < 7; index++) {
    const request = { ...input, id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}` }
    assert.equal((await turn(service, request)).reason, 'BUSY')
  }
  assert.equal(calls, 1)
  service.close(); await running
})

test('already aborted input and invalid provider audio never consume or return audio', async () => {
  assert.equal(typeof module.VoiceService, 'function')
  let calls = 0
  const service = new module.VoiceService({ synthesize: async () => { calls++; return { contentType: 'text/html', bytes: new Uint8Array(1) } } }, limits)
  const controller = new AbortController(); controller.abort()
  assert.equal((await turn(service, input, user, controller.signal)).reason, 'CANCELLED')
  assert.equal(calls, 0)
  assert.equal((await turn(service)).reason, 'INVALID_AUDIO')
})
