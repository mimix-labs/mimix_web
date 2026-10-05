import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import * as module from '../dist/modules/voice/elevenlabs.js'
const settings = { apiKey: 'fixture-private-key', voiceId: 'JBFqnCBsd6RMkjVDRZzb', retention: 'zero' }
const mp3 = new Uint8Array(readFileSync(new URL('./fixtures/voice-silence.mp3', import.meta.url)))
const options = () => ({ signal: new AbortController().signal })

test('ElevenLabs uses only fixed HTTPS destination, server voice/key and explicit retention', async () => {
  assert.equal(typeof module.ElevenLabsVoiceProvider, 'function')
  let request
  const provider = new module.ElevenLabsVoiceProvider(settings, async (url, init) => {
    request = { url: String(url), ...init }
    return new Response(mp3, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(mp3.length) } })
  })
  assert.deepEqual(await provider.synthesize('Hola', options()), { contentType: 'audio/mpeg', bytes: mp3 })
  assert.equal(request.url, 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128&enable_logging=false')
  assert.equal(request.redirect, 'error')
  assert.equal(request.headers['xi-api-key'], settings.apiKey)
  assert.deepEqual(JSON.parse(request.body), { text: 'Hola', model_id: 'eleven_flash_v2_5' })
  for (const voiceId of ['../x', 'https://evil.test', 'x?key=secret', 'a/b', 'x#y']) assert.throws(() => new module.ElevenLabsVoiceProvider({ ...settings, voiceId }))
})

test('upstream statuses and transport errors expose stable codes without response bodies or secrets', async () => {
  assert.equal(typeof module.ElevenLabsVoiceProvider, 'function')
  for (const [status, code] of [[401, 'PROVIDER_UNAVAILABLE'], [403, 'PROVIDER_UNAVAILABLE'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE'], [302, 'PROVIDER_UNAVAILABLE']]) {
    const provider = new module.ElevenLabsVoiceProvider(settings, async () => new Response('PRIVATE UPSTREAM', { status }))
    await assert.rejects(provider.synthesize('Hola', options()), error => error.code === code && !error.message.includes('PRIVATE'))
  }
  const provider = new module.ElevenLabsVoiceProvider(settings, async () => { throw new Error(settings.apiKey) })
  await assert.rejects(provider.synthesize('Hola', options()), error => error.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes(settings.apiKey))
})

test('audio validation rejects MIME, oversized streams, empty, non-MP3 and truncated bodies', async () => {
  assert.equal(typeof module.ElevenLabsVoiceProvider, 'function')
  for (const [body, headers] of [
    [mp3, { 'content-type': 'text/html' }], [mp3, { 'content-type': 'audio/mpeg', 'content-length': '1048577' }],
    [new Uint8Array(1048577), { 'content-type': 'audio/mpeg' }], ['', { 'content-type': 'audio/mpeg' }],
    ['not audio', { 'content-type': 'audio/mpeg' }], [mp3, { 'content-type': 'audio/mpeg', 'content-length': '20' }],
  ]) {
    const provider = new module.ElevenLabsVoiceProvider(settings, async () => new Response(body, { headers }))
    await assert.rejects(provider.synthesize('Hola', options()), { code: 'INVALID_AUDIO' })
  }
})

test('aborting an incomplete upstream stream cancels its reader without exposing partial audio', async () => {
  assert.equal(typeof module.ElevenLabsVoiceProvider, 'function')
  let cancelled = false, started
  const ready = new Promise(resolve => { started = resolve })
  const body = new ReadableStream({ start(controller) { controller.enqueue(mp3) }, pull() { started() }, cancel() { cancelled = true } })
  const controller = new AbortController()
  const provider = new module.ElevenLabsVoiceProvider(settings, async () => new Response(body, { headers: { 'content-type': 'audio/mpeg' } }))
  const pending = provider.synthesize('Hola', { signal: controller.signal })
  await ready; controller.abort()
  await assert.rejects(pending, { code: 'CANCELLED' })
  assert.equal(cancelled, true)
})

test('truncated MP3 signatures and partial MPEG frames without Content-Length are rejected', async () => {
  for (const body of [new Uint8Array([73, 68, 51]), new Uint8Array([255, 255, 255]),
    new Uint8Array([255, 251, 144, 0]), mp3.subarray(0, mp3.length - 1),
    new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 4, 0]),
  ]) {
    const provider = new module.ElevenLabsVoiceProvider(settings, async () => new Response(body, { headers: { 'content-type': 'audio/mpeg' } }))
    await assert.rejects(provider.synthesize('Hola', options()), { code: 'INVALID_AUDIO' })
  }
})
