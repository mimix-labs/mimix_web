import { VoiceError, type VoiceProvider } from '@mimix/voice-contract'

/** Test fixture only; never selected by environment configuration. Not playable speech. */
export class FakeVoiceProvider implements VoiceProvider {
  async synthesize(_text: string, { signal }: { signal: AbortSignal }) {
    if (signal.aborted) throw new VoiceError('CANCELLED')
    return { contentType: 'audio/mpeg' as const, bytes: new Uint8Array([73, 68, 51, 0]) }
  }
}
