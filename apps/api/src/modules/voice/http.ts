import { z } from 'zod'
import { voiceIdSchema, voiceRequestSchema } from '@mimix/voice-contract'
import type { VoiceService } from './service.js'

export class VoiceHttpError extends Error {
  constructor(readonly status: 400 | 415) { super('invalid voice request') }
}
const empty = z.strictObject({})
export class VoiceHttp {
  constructor(private readonly voice: VoiceService) {}
  speak(userId: string, data: unknown, query: unknown, signal: AbortSignal) {
    const input = voiceRequestSchema.safeParse(data)
    if (!input.success || !empty.safeParse(query).success) throw new VoiceHttpError(400)
    return this.voice.speak(userId, input.data, signal)
  }
  cancel(userId: string, id: unknown, query: unknown) {
    const parsed = voiceIdSchema.safeParse(id)
    if (!parsed.success || !empty.safeParse(query).success) throw new VoiceHttpError(400)
    return { cancelled: this.voice.cancel(userId, parsed.data) }
  }
}
