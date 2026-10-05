import { EmbodimentSessions } from '../embodiments/sessions.js'
import { WebEmbodiment } from '../embodiments/adapters.js'
import { MAX_AUDIO_BYTES, VoiceError, voiceIdSchema, voiceRequestSchema, type VoiceProvider, type VoiceReason, type VoiceResult } from '@mimix/voice-contract'
import type { VoiceLimits } from './config.js'

type Active = { id: string; controller: AbortController; reason: VoiceReason }
type Bucket = { expires: number; requests: number; characters: number }
export class VoiceService {
  private readonly active = new Map<string, Active>()
  private readonly buckets = new Map<string, Bucket>()
  private day = { expires: 0, characters: 0 }
  private providerCalls = 0
  private closed = false
  private readonly limits: VoiceLimits
  constructor(private readonly provider: VoiceProvider | undefined, limits: VoiceLimits, private readonly now: () => number = Date.now, readonly embodiments = new EmbodimentSessions()) {
    const { timeoutMs, maxConcurrent, requestsPerMinute, charactersPerMinute, charactersPerDay } = limits
    this.limits = { timeoutMs, maxConcurrent, requestsPerMinute, charactersPerMinute, charactersPerDay }
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('Invalid voice limits.')
  }
  private reserve(user: string, characters: number): boolean {
    const now = this.now()
    for (const [id, bucket] of this.buckets) if (bucket.expires <= now) this.buckets.delete(id)
    if (this.day.expires <= now) this.day = { expires: now + 86400000, characters: 0 }
    const bucket = this.buckets.get(user) ?? { expires: now + 60000, requests: 0, characters: 0 }
    if ((!this.buckets.has(user) && this.buckets.size >= 1000) || bucket.requests >= this.limits.requestsPerMinute
      || bucket.characters + characters > this.limits.charactersPerMinute || this.day.characters + characters > this.limits.charactersPerDay) return false
    bucket.requests++; bucket.characters += characters; this.day.characters += characters
    this.buckets.set(user, bucket)
    return true
  }
  private abort(active: Active, reason: VoiceReason): void {
    if (!active.controller.signal.aborted) { active.reason = reason; active.controller.abort() }
  }
  cancel(userId: string, id: string): boolean {
    const user = voiceIdSchema.parse(userId), utterance = voiceIdSchema.parse(id)
    const active = this.active.get(user)
    if (!active || active.id !== utterance) return false
    this.abort(active, 'CANCELLED')
    return true
  }
  close(): void {
    this.closed = true
    for (const active of this.active.values()) this.abort(active, 'CANCELLED')
    this.buckets.clear()
    this.embodiments.close()
  }
  async speak(userId: string, data: unknown, clientSignal?: AbortSignal): Promise<VoiceResult> {
    const user = voiceIdSchema.parse(userId), request = voiceRequestSchema.parse(data)
    const base = { schemaVersion: 1 as const, id: request.id, subtitle: request.text }
    const fallback = (reason: VoiceReason): VoiceResult => ({ ...base, status: 'text_only', reason })
    if (this.closed || clientSignal?.aborted) return fallback('CANCELLED')
    if (!this.provider) return fallback('DISABLED')
    const coordinator = this.embodiments.forUser(user)
    if (!coordinator) return fallback('BUSY')
    const state = coordinator.snapshot()
    if (state.phase === 'virtual') coordinator.heartbeat(state.lease.leaseId, state.lease.holderId)
    const permission = new WebEmbodiment(coordinator).permit()
    if (!permission) return fallback('EMBODIMENT_MUTED')
    const releaseWeb = coordinator.retainWeb(permission.leaseId)
    if (!releaseWeb) return fallback('EMBODIMENT_MUTED')
    const previous = this.active.get(user)
    if (previous?.id === request.id || this.providerCalls >= this.limits.maxConcurrent) { releaseWeb(); return fallback('BUSY') }
    if (!this.reserve(user, request.text.length)) { releaseWeb(); return fallback('QUOTA_EXCEEDED') }
    if (previous) this.abort(previous, 'INTERRUPTED')
    const active: Active = { id: request.id, controller: new AbortController(), reason: 'CANCELLED' }
    this.active.set(user, active)
    const leaseLost = () => this.abort(active, 'EMBODIMENT_MUTED')
    permission.signal.addEventListener('abort', leaseLost, { once: true })
    const disconnect = () => this.abort(active, 'CANCELLED')
    clientSignal?.addEventListener('abort', disconnect, { once: true })
    const timer = setTimeout(() => this.abort(active, 'TIMEOUT'), this.limits.timeoutMs)
    let rejectAbort: () => void = () => undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new VoiceError(active.reason))
      active.controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    this.providerCalls++
    const providerCall = Promise.resolve()
      .then(() => this.provider!.synthesize(request.text, { signal: active.controller.signal }))
      .finally(() => { this.providerCalls-- })
    try {
      const audio = await Promise.race([providerCall, aborted])
      if (active.controller.signal.aborted) return fallback(active.reason)
      if (!permission.isCurrent()) return fallback('EMBODIMENT_MUTED')
      if (audio?.contentType !== 'audio/mpeg' || !(audio.bytes instanceof Uint8Array) || audio.bytes.length < 3 || audio.bytes.length > MAX_AUDIO_BYTES) return fallback('INVALID_AUDIO')
      return { ...base, status: 'ready', audio: { contentType: 'audio/mpeg', base64: Buffer.from(audio.bytes).toString('base64') } }
    } catch (error) {
      return fallback(active.controller.signal.aborted ? active.reason : error instanceof VoiceError ? error.code : 'PROVIDER_UNAVAILABLE')
    } finally {
      clearTimeout(timer)
      releaseWeb()
      permission.signal.removeEventListener('abort', leaseLost)
      clientSignal?.removeEventListener('abort', disconnect)
      active.controller.signal.removeEventListener('abort', rejectAbort)
      if (this.active.get(user) === active) this.active.delete(user)
    }
  }
}
