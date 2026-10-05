import { embodimentIdSchema } from '@mimix/embodiment-contract'
import { EmbodimentCoordinator, leaseClock, type CoordinatorOptions } from './coordinator.js'

interface Session { coordinator: EmbodimentCoordinator; lastUsed: number }
export class EmbodimentSessions {
  private readonly sessions = new Map<string, Session>()
  private readonly maxSessions: number
  private readonly idleMs: number
  private readonly clock
  private closed = false
  constructor(private readonly options: CoordinatorOptions & { maxSessions?: number; idleMs?: number } = {}) {
    this.maxSessions = options.maxSessions ?? 1000
    this.idleMs = options.idleMs ?? 300000
    this.clock = options.clock ?? leaseClock
    if (!Number.isSafeInteger(this.maxSessions) || this.maxSessions < 1 || this.maxSessions > 1000
      || !Number.isSafeInteger(this.idleMs) || this.idleMs < 100 || this.idleMs > 300000) throw new Error('Invalid embodiment session limits.')
  }
  /** Current voice API has one implicit conversation per verified internal user UUID. */
  forUser(userId: string): EmbodimentCoordinator | undefined {
    const user = embodimentIdSchema.parse(userId)
    if (this.closed) return undefined
    const now = this.clock.now()
    for (const [key, session] of this.sessions) {
      if (now - session.lastUsed >= this.idleMs && session.coordinator.snapshot().phase !== 'robot') {
        session.coordinator.close(); this.sessions.delete(key)
      }
    }
    const existing = this.sessions.get(user)
    if (existing) { existing.lastUsed = now; return existing.coordinator }
    if (this.sessions.size >= this.maxSessions) return undefined
    const coordinator = new EmbodimentCoordinator(user, user, this.options)
    this.sessions.set(user, { coordinator, lastUsed: now })
    return coordinator
  }
  close(): void {
    this.closed = true
    for (const session of this.sessions.values()) session.coordinator.close()
    this.sessions.clear()
  }
}
