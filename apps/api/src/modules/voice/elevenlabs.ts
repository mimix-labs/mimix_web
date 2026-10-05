import { completeMp3 } from './mp3.js'
import { MAX_AUDIO_BYTES, VoiceError, voiceRequestSchema, type VoiceAudio, type VoiceProvider } from '@mimix/voice-contract'

export interface ElevenLabsSettings { apiKey: string; voiceId: string; retention: 'standard' | 'zero' }
/** Server only. Destination and model cannot be selected by an HTTP caller. */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  private readonly settings: ElevenLabsSettings
  constructor(settings: ElevenLabsSettings, private readonly transport: typeof fetch = fetch) {
    if (!/^[A-Za-z0-9]{1,64}$/.test(settings.voiceId) || !/^[\x21-\x7e]{1,256}$/.test(settings.apiKey)
      || !['standard', 'zero'].includes(settings.retention)) throw new Error('Invalid voice configuration.')
    this.settings = { ...settings }
  }
  async synthesize(text: string, { signal }: { signal: AbortSignal }): Promise<VoiceAudio> {
    voiceRequestSchema.shape.text.parse(text)
    let response: Response | undefined
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const cancel = () => { void reader?.cancel().catch(() => undefined) }
    try {
      if (signal.aborted) throw new VoiceError('CANCELLED')
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.settings.voiceId}/stream?output_format=mp3_44100_128&enable_logging=${this.settings.retention === 'standard'}`
      response = await this.transport(url, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'xi-api-key': this.settings.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      })
      if (signal.aborted) throw new VoiceError('CANCELLED')
      if (!response.ok) throw new VoiceError(response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE')
      const length = response.headers.get('content-length')
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'audio/mpeg' || !response.body
        || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_AUDIO_BYTES))) throw new VoiceError('INVALID_AUDIO')
      reader = response.body.getReader()
      signal.addEventListener('abort', cancel, { once: true })
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (signal.aborted) throw new VoiceError('CANCELLED')
        if (done) break
        size += value.byteLength
        if (size > MAX_AUDIO_BYTES) throw new VoiceError('INVALID_AUDIO')
        chunks.push(value)
      }
      const bytes = Buffer.concat(chunks, size)
      if (!completeMp3(bytes) || (length !== null && Number(length) !== size)) throw new VoiceError('INVALID_AUDIO')
      return { contentType: 'audio/mpeg', bytes: new Uint8Array(bytes) }
    } catch (error) {
      if (signal.aborted) throw new VoiceError('CANCELLED')
      throw error instanceof VoiceError ? error : new VoiceError('PROVIDER_UNAVAILABLE')
    } finally {
      signal.removeEventListener('abort', cancel)
      if (reader) { cancel(); reader.releaseLock() }
      else void response?.body?.cancel().catch(() => undefined)
    }
  }
}
