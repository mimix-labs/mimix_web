import type { VoiceConfig } from './config.js'
import { ElevenLabsVoiceProvider } from './elevenlabs.js'
import { VoiceService } from './service.js'
export function createVoiceService(config: VoiceConfig): VoiceService {
  return new VoiceService(config.provider === 'elevenlabs' ? new ElevenLabsVoiceProvider(config) : undefined, config)
}
