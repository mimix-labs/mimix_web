import type { ChallengeContext, ChallengeLifecycle } from '@mimix/challenge-sdk'
export interface Surface {
  initialize(): void | Promise<void>
  start?(): void | Promise<void>
  pause?(): void | Promise<void>
  resume?(): void | Promise<void>
  dispose(): void | Promise<void>
  handleHands?(results: unknown): void
}
export interface SurfaceChallenge extends ChallengeLifecycle {
  handleHands(results: unknown): void
  readonly running: boolean
}
/** Local lifecycle for the two trusted official views. This is NOT a sandbox. */
export function createSurfaceChallenge(context: Pick<ChallengeContext, 'signal'>, surface: Surface): SurfaceChallenge {
  let state = 'created', busy = false, ended = false
  let pending: Promise<void> = Promise.resolve()
  let disposal: Promise<void> | undefined
  const error = (code: string) => Object.assign(new Error(code), { code })
  function transition(from: string, to: string, action?: () => void | Promise<void>): Promise<void> {
    if (ended || context.signal.aborted) return Promise.reject(error('ABORTED'))
    if (busy || state !== from) return Promise.reject(error('INVALID_LIFECYCLE'))
    busy = true
    const operation = (async () => {
      try {
        await action?.()
        if (ended || context.signal.aborted) throw error('ABORTED')
        state = to
      } finally { busy = false }
    })()
    pending = operation.catch(() => {})
    return operation
  }
  function dispose(): Promise<void> {
    if (disposal) return disposal
    ended = true
    context.signal.removeEventListener('abort', onAbort)
    disposal = pending.then(() => surface.dispose()).then(() => { state = 'disposed' })
    return disposal
  }
  function onAbort() { void dispose().catch(() => {}) }
  context.signal.addEventListener('abort', onAbort, { once: true })
  return {
    get running() { return state === 'running' && !ended && !context.signal.aborted },
    initialize: () => transition('created', 'ready', () => surface.initialize()),
    start: () => transition('ready', 'running', () => surface.start?.()),
    pause: () => transition('running', 'paused', () => surface.pause?.()),
    resume: () => transition('paused', 'running', () => surface.resume?.()),
    dispose,
    handleHands(results) { if (this.running) surface.handleHands?.(results) },
  }
}
