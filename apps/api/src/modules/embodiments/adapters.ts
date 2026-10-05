import { embodimentIdSchema, type EmbodimentOutput, type EmbodimentPermit } from '@mimix/embodiment-contract'
import type { EmbodimentCoordinator } from './coordinator.js'

export class WebEmbodiment {
  private detach: (() => void) | undefined
  private activeId: string | undefined
  private closed = false
  constructor(private readonly coordinator: EmbodimentCoordinator, private readonly output?: EmbodimentOutput) {}
  permit(): EmbodimentPermit | undefined {
    if (this.closed) return undefined
    const state = this.coordinator.snapshot()
    return state.lease ? this.coordinator.permit('web', state.lease.leaseId) : undefined
  }
  /** Synchronous playback handoff; never queue a callback that bypasses a fresh permit check. */
  present(permit: EmbodimentPermit | undefined, utteranceId: string, play: () => void): boolean {
    if (this.closed || !this.output || !permit) return false
    const id = embodimentIdSchema.parse(utteranceId)
    const current = this.coordinator.permit('web', permit.leaseId)
    if (!current || current.signal !== permit.signal) return false
    const release = this.coordinator.retainWeb(permit.leaseId)
    if (!release) return false
    if (!this.coordinator.claimUtterance(permit.leaseId, id)) { release(); return false }
    this.stop()
    if (this.closed || !current.isCurrent()) { release(); return false }
    const stop = () => this.stop()
    current.signal.addEventListener('abort', stop, { once: true })
    this.detach = () => { current.signal.removeEventListener('abort', stop); release() }
    this.activeId = id
    try { play() } catch (error) { this.stop(); throw error }
    return true
  }
  /** Releases a naturally completed clip without stopping a newer utterance. */
  complete(utteranceId: string): boolean {
    const id = embodimentIdSchema.parse(utteranceId)
    if (this.closed || this.activeId !== id) return false
    return this.release()
  }
  private release(): boolean {
    if (!this.detach) return false
    const detach = this.detach
    this.detach = undefined
    this.activeId = undefined
    detach()
    return true
  }
  private stop(): void {
    if (!this.release()) return
    try { this.output?.stop() } catch { this.closed = true; this.coordinator.close() }
  }
  close(): void { this.closed = true; this.stop() }
}
/** Contract-only physical output. Never emits audio, network messages or actuator commands. */
export class RobotEmbodiment {
  constructor(private readonly coordinator: EmbodimentCoordinator) {}
  perform(leaseId: string, utteranceId: string): { status: 'stub' | 'suppressed' } {
    const permit = this.coordinator.permit('robot', leaseId)
    return { status: permit && this.coordinator.claimUtterance(permit.leaseId, utteranceId) ? 'stub' : 'suppressed' }
  }
}
