import assert from 'node:assert/strict'
import test from 'node:test'
import { VoiceService } from '../dist/modules/voice/service.js'
import { EmbodimentSessions } from '../dist/modules/embodiments/sessions.js'
import { voiceResultSchema } from '@mimix/voice-contract'
const user = '11111111-1111-4111-8111-111111111111', robot = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333'
const input = { schemaVersion: 1, id: '44444444-4444-4444-8444-444444444444', text: 'Subtítulo siempre disponible' }
const limits = { timeoutMs: 1000, maxConcurrent: 4, requestsPerMinute: 6, charactersPerMinute: 3000, charactersPerDay: 50000 }
const audio = { contentType: 'audio/mpeg', bytes: new Uint8Array([73, 68, 51, 0]) }

test('robot lease suppresses web before provider/quota; revocation restores virtual voice', async () => {
  const sessions = new EmbodimentSessions()
  let calls = 0
  const service = new VoiceService({ synthesize: async () => { calls++; return audio } }, { ...limits, requestsPerMinute: 1 }, Date.now, sessions)
  const c = sessions.forUser(user), lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  const muted = await service.speak(user, input)
  assert.equal(muted.reason, 'EMBODIMENT_MUTED')
  assert.equal(muted.subtitle, input.text); assert.equal('audio' in muted, false)
  assert.equal(voiceResultSchema.safeParse(muted).success, true); assert.equal(calls, 0)
  assert.equal((await service.speak(other, input)).status, 'ready')
  c.revoke(lease.leaseId)
  assert.equal((await service.speak(user, input)).status, 'ready')
  assert.equal(calls, 2)
  service.close()
})

test('transfer aborts pending synthesis; late provider completion cannot leak audio after reconnection', async () => {
  const sessions = new EmbodimentSessions()
  let finish, signal
  const service = new VoiceService({ synthesize: (_text, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve }) } }, limits, Date.now, sessions)
  const pending = service.speak(user, input)
  await Promise.resolve()
  const c = sessions.forUser(user), lease = c.acquireRobot(c.snapshot().lease.leaseId, robot)
  assert.equal(signal.aborted, true)
  c.revoke(lease.leaseId)
  finish(audio)
  assert.equal((await pending).reason, 'EMBODIMENT_MUTED')
  service.close()
})

test('voice fails closed on exhausted registry and shutdown revokes every lease', async () => {
  const sessions = new EmbodimentSessions({ maxSessions: 1 })
  const c = sessions.forUser(user)
  let calls = 0
  const service = new VoiceService({ synthesize: async () => { calls++; return audio } }, limits, Date.now, sessions)
  assert.equal((await service.speak(other, input)).reason, 'BUSY')
  assert.equal(calls, 0)
  service.close()
  assert.equal(c.snapshot().phase, 'closed')
})
