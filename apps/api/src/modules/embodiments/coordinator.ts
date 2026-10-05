import { randomUUID } from 'node:crypto'
import { embodimentIdSchema, type EmbodimentKind, type EmbodimentLease, type EmbodimentPermit, type EmbodimentState } from '@mimix/embodiment-contract'

export interface LeaseClock {
  now(): number
  schedule(callback: () => void, delayMs: number): () => void
}
export const leaseClock: LeaseClock = {
  now: () => performance.timeOrigin + performance.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    timer.unref()
    return () => clearTimeout(timer)
  },
}
export interface CoordinatorOptions { ttlMs?: number; maxUtterances?: number; clock?: LeaseClock }
/** Single-process authority. Robot acquisition is a trusted, already-authorized server operation. */
export class EmbodimentCoordinator {
  private lease: EmbodimentLease | undefined
  private controller = new AbortController()
  private cancelTimer: (() => void) | undefined
  private revision = 0
  private closed = false
  private transitioning = false
  private readonly delivered = new Set<string>()
  private readonly conversationId: string
  private readonly webHolderId: string
  private readonly clock: LeaseClock
  private readonly ttlMs: number
  private readonly maxUtterances: number
  constructor(conversationId: string, webHolderId: string, options: CoordinatorOptions = {}) {
    this.conversationId = embodimentIdSchema.parse(conversationId)
    this.webHolderId = embodimentIdSchema.parse(webHolderId)
    this.clock = options.clock ?? leaseClock
    this.ttlMs = options.ttlMs ?? 15000
    this.maxUtterances = options.maxUtterances ?? 256
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 100 || this.ttlMs > 60000
      || !Number.isSafeInteger(this.maxUtterances) || this.maxUtterances < 1 || this.maxUtterances > 256) throw new Error('Invalid embodiment limits.')
    this.replace('web', this.webHolderId)
  }
  private arm(): void {
    this.cancelTimer?.()
    const lease = this.lease!
    const { leaseId, expiresAt } = lease
    this.cancelTimer = this.clock.schedule(() => {
      if (this.lease?.leaseId === leaseId && this.lease.expiresAt === expiresAt) {
        this.expire()
        if (this.lease?.leaseId === leaseId) this.arm()
      }
    }, Math.max(0, expiresAt - this.clock.now()))
  }
  private replace(kind: EmbodimentKind, holderId: string): EmbodimentLease | undefined {
    const previous = this.controller
    this.transitioning = true
    this.controller = new AbortController()
    this.lease = { schemaVersion: 1, conversationId: this.conversationId, leaseId: randomUUID(), holderId, kind, revision: ++this.revision, expiresAt: this.clock.now() + this.ttlMs }
    try { previous.abort() } finally { this.transitioning = false }
    if (this.closed) return undefined
    this.arm()
    return { ...this.lease! }
  }
  private expire(): void {
    if (!this.closed && !this.transitioning && this.lease!.expiresAt <= this.clock.now()) this.replace('web', this.webHolderId)
  }
  snapshot(): EmbodimentState {
    this.expire()
    if (!this.lease) return { schemaVersion: 1, phase: 'closed', lease: null, webMuted: true }
    return this.lease.kind === 'web'
      ? { schemaVersion: 1, phase: 'virtual', lease: { ...this.lease, kind: 'web' }, webMuted: false }
      : { schemaVersion: 1, phase: 'robot', lease: { ...this.lease, kind: 'robot' }, webMuted: true }
  }
  acquireRobot(expectedLeaseId: string, holderId: string): EmbodimentLease | undefined {
    const expected = embodimentIdSchema.parse(expectedLeaseId), holder = embodimentIdSchema.parse(holderId)
    this.expire()
    if (this.closed || this.transitioning || this.lease?.leaseId !== expected) return undefined
    return this.replace('robot', holder)
  }
  heartbeat(leaseId: string, holderId: string): boolean {
    const id = embodimentIdSchema.parse(leaseId), holder = embodimentIdSchema.parse(holderId)
    this.expire()
    if (this.closed || this.transitioning || this.lease?.leaseId !== id || this.lease.holderId !== holder) return false
    this.lease.expiresAt = this.clock.now() + this.ttlMs
    this.arm()
    return true
  }
  revoke(leaseId: string): boolean {
    const id = embodimentIdSchema.parse(leaseId)
    this.expire()
    if (this.closed || this.transitioning || this.lease?.leaseId !== id) return false
    this.replace('web', this.webHolderId)
    return true
  }
  permit(kind: EmbodimentKind, leaseId: string): EmbodimentPermit | undefined {
    const id = embodimentIdSchema.parse(leaseId)
    this.expire()
    if (this.closed || this.transitioning || this.lease?.leaseId !== id || this.lease.kind !== kind) return undefined
    const signal = this.controller.signal
    return { leaseId: id, signal, isCurrent: () => {
      this.expire()
      return !this.closed && !this.transitioning && !signal.aborted && this.lease?.leaseId === id
    } }
  }
  claimUtterance(leaseId: string, utteranceId: string): boolean {
    const id = embodimentIdSchema.parse(leaseId), utterance = embodimentIdSchema.parse(utteranceId)
    this.expire()
    if (this.closed || this.transitioning || this.lease?.leaseId !== id || this.delivered.has(utterance) || this.delivered.size >= this.maxUtterances) return false
    this.delivered.add(utterance)
    return true
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    this.lease = undefined
    this.cancelTimer?.()
    this.controller.abort()
    this.delivered.clear()
  }
}
