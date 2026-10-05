import { robotControlEnvelopeSchema, type RobotControlAck, type RobotControlEnvelope, type RobotAckReason } from './control.js'
import type { BehaviorIntent } from './v1.js'
export interface GatewayClock { now(): number; schedule(callback: () => void, delayMs: number): () => void }
export interface GatewayOutput {
  /** Synchronous semantic handoff only. Driver must honor abort and stop. */
  perform(intent: BehaviorIntent, signal: AbortSignal): void
  stop(reason: string): void
}
export interface GatewayOptions {
  sessionId: string; deviceId: string; connectionId: string; behaviors: BehaviorIntent['behavior'][]
  output: GatewayOutput; clock?: GatewayClock
}
/** One authenticated gateway connection. Reconnect MUST create a new nonce/guard. */
export class GatewayGuard {
  private readonly clock: GatewayClock
  private readonly seen = new Map<string, { fingerprint: string; ack: RobotControlAck }>()
  private highWater = 0
  private closed = false
  private controller?: AbortController
  private cancel?: () => void
  constructor(private readonly options: GatewayOptions) {
    this.clock = options.clock ?? { now: Date.now, schedule(callback, ms) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
    this.stop('STARTUP')
  }
  private stop(reason: string): void {
    this.cancel?.(); this.cancel = undefined
    const controller = this.controller; this.controller = undefined
    controller?.abort()
    try { this.options.output.stop(reason) } catch { this.closed = true }
  }
  disconnect(): void { this.closed = true; this.stop('DISCONNECTED') }
  private ack(value: RobotControlEnvelope, reason: RobotAckReason): RobotControlAck {
    return { schemaVersion: 1, sessionId: value.sessionId, connectionId: value.connectionId, intentId: value.intent.intentId,
      leaseId: value.intent.leaseId, sequence: value.sequence, status: reason === 'ACCEPTED' ? 'accepted' : reason === 'STOPPED' ? 'stopped' : 'rejected', reason }
  }
  receive(input: unknown, retained = false): RobotControlAck | undefined {
    if (this.closed) return undefined
    const parsed = robotControlEnvelopeSchema.safeParse(input)
    if (!parsed.success || retained) { this.stop('INVALID_CONTROL'); return undefined }
    const value = parsed.data, { intent } = value
    if (value.sessionId !== this.options.sessionId || value.connectionId !== this.options.connectionId || intent.deviceId !== this.options.deviceId) { this.stop('SCOPE'); return undefined }
    const reject = (reason: RobotAckReason) => { this.stop(reason); return this.ack(value, reason) }
    const now = this.clock.now()
    if (intent.expiresAt <= now || value.leaseExpiresAt <= now) return reject('EXPIRED')
    if (intent.issuedAt > now) return reject('FUTURE')
    const previous = this.seen.get(intent.intentId), fingerprint = JSON.stringify(value)
    if (previous) return previous.fingerprint === fingerprint ? { ...previous.ack } : reject('CONFLICT')
    if (value.sequence <= this.highWater) return reject('OUT_OF_ORDER')
    this.highWater = value.sequence
    if (this.seen.size >= 256) return reject('CAPACITY')
    if (!this.options.behaviors.includes(intent.behavior)) return reject('UNSUPPORTED')
    this.stop('REPLACED')
    if (this.closed) return this.ack(value, 'DRIVER_FAILED')
    let ack: RobotControlAck
    if (intent.behavior === 'stop') ack = this.ack(value, 'STOPPED')
    else {
      const controller = new AbortController(); this.controller = controller
      try {
        // setTimeout uses elapsed time after this calculation; wall-clock changes
        // cannot extend an already-running output watchdog.
        this.cancel = this.clock.schedule(() => this.stop('EXPIRED'), Math.min(2000, intent.expiresAt - now, value.leaseExpiresAt - now))
        this.options.output.perform(intent, controller.signal)
        ack = this.ack(value, 'ACCEPTED')
      } catch { this.closed = true; this.stop('DRIVER_FAILED'); ack = this.ack(value, 'DRIVER_FAILED') }
    }
    this.seen.set(intent.intentId, { fingerprint, ack })
    return { ...ack }
  }
}
