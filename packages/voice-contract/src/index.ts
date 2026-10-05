import { z } from 'zod'

export const MAX_VOICE_TEXT = 1000
export const MAX_AUDIO_BYTES = 1048576
export const voiceIdSchema = z.uuid().transform(value => value.toLowerCase())
const text = z.string().min(1).max(MAX_VOICE_TEXT).refine(value => value.trim().length > 0)
export const voiceRequestSchema = z.strictObject({ schemaVersion: z.literal(1), id: voiceIdSchema, text })
export const voiceReasonSchema = z.enum(['DISABLED', 'CANCELLED', 'INTERRUPTED', 'TIMEOUT', 'QUOTA_EXCEEDED', 'BUSY', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_AUDIO'])
const base = { schemaVersion: z.literal(1), id: voiceIdSchema, subtitle: text }
export const voiceResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...base, status: z.literal('text_only'), reason: voiceReasonSchema }),
  z.strictObject({ ...base, status: z.literal('ready'), audio: z.strictObject({
    contentType: z.literal('audio/mpeg'),
    base64: z.string().min(4).max(1398104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }) }),
])
export type VoiceRequest = z.infer<typeof voiceRequestSchema>
export type VoiceResult = z.infer<typeof voiceResultSchema>
export type VoiceReason = z.infer<typeof voiceReasonSchema>
export interface VoiceAudio { contentType: 'audio/mpeg'; bytes: Uint8Array }
export interface VoiceProvider {
  /** Server-owned configuration. No user IDs or provider options in text requests. */
  synthesize(text: string, options: { signal: AbortSignal }): Promise<VoiceAudio>
}
export class VoiceError extends Error {
  constructor(readonly code: VoiceReason) { super('Voice generation unavailable.') }
}
