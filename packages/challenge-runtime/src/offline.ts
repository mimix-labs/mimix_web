import { learningRecordSchema, offlineRecordSchema, type LearningRecord, type OfflineAttempt } from '@mimix/contracts'
import type { z } from 'zod'
export type PendingOfflineRecord = z.infer<typeof offlineRecordSchema>
export type OfflineSyncState = 'pending' | 'synchronized' | 'login_required' | 'conflict' | 'storage_full' | 'storage_unavailable'
export interface OfflineSession { token: string }
type AttemptWork = { flush: (connection: Connection) => Promise<void>; replace: (incoming: PendingOfflineRecord | null) => PendingOfflineRecord | null }
type SessionWork = { phase: 'active' | 'syncing' | 'sealed'; opening: Set<Promise<unknown>>; flushes: Map<string, AttemptWork> }
// Stable origin/capability coordinates reconstructed handles too. Restore all pending attempts before sync.
const sessions = new Map<string, SessionWork>()
function work(connection: Connection): SessionWork {
  const key = `${connection.origin}\0${connection.session.token}`
  let value = sessions.get(key)
  if (!value) { value = { phase: 'active', opening: new Set(), flushes: new Map() }; sessions.set(key, value) }
  return value
}
interface Connection { origin: string; session: OfflineSession; signal?: AbortSignal }
export class OfflineProgressError extends Error {
  constructor(readonly status: number, readonly state: OfflineSyncState, message: string) { super(message) }
}
async function request(connection: Connection, path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${connection.origin}/api/offline/${path}`, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Local ${connection.session.token}`, ...(token ? { 'x-mimix-sync-token': token } : {}) },
      body: JSON.stringify(body), signal: connection.signal ? AbortSignal.any([connection.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
  } catch (error) { connection.signal?.throwIfAborted(); throw new OfflineProgressError(503, 'pending', error instanceof Error ? error.message : 'gateway unavailable') }
  let value: Record<string, unknown>
  try { value = await response.json() as Record<string, unknown> } catch { throw new OfflineProgressError(503, 'pending', 'invalid gateway response') }
  if (!response.ok) {
    const state: OfflineSyncState = response.status === 401 ? 'login_required' : response.status === 409 ? 'conflict' : response.status === 507 ? 'storage_full' : value.state === 'storage_unavailable' ? 'storage_unavailable' : 'pending'
    throw new OfflineProgressError(response.status, state, typeof value.error === 'string' ? value.error : 'offline operation failed')
  }
  return value
}
/** Keep this handle/capability in the trusted host, never in challenge code. */
export async function createOfflineSession(origin: string, signal?: AbortSignal): Promise<OfflineSession & { sessionId: string }> {
  const value = await request({ origin, session: { token: '' }, signal }, 'sessions', {})
  if (typeof value.token !== 'string' || typeof value.sessionId !== 'string') throw new Error('invalid local session response')
  return { token: value.token, sessionId: value.sessionId }
}
/** Persist attempt IDs before opening. savePending must durably checkpoint before network I/O. */
export async function openOfflineProgress(options: Connection & {
  attempt: OfflineAttempt; pending?: PendingOfflineRecord | null
  savePending: (event: PendingOfflineRecord | null) => Promise<void>
}) {
  const state = work(options)
  if (state.phase !== 'active') throw new Error('local session sealing or sealed')
  const opening = request(options, 'attempts', options.attempt)
  state.opening.add(opening)
  let started: Record<string, unknown>
  try { started = await opening } finally { state.opening.delete(opening) }
  if (!Number.isSafeInteger(started.lastSequence) || Number(started.lastSequence) < 1) throw new Error('invalid local sequence')
  let sequence = Number(started.lastSequence)
  let pending = options.pending ? offlineRecordSchema.parse(options.pending) : null
  const predecessor = state.flushes.get(options.attempt.attemptId)
  if (predecessor) {
    const retained = predecessor.replace(pending)
    pending = retained ?? pending
  }
  let retired = false
  let running: Promise<void> | undefined
  const deliver = async (connection: Connection = options) => {
    if (!pending) return
    await request(connection, 'events', { attemptId: options.attempt.attemptId, event: pending })
    sequence = Math.max(sequence, pending.sequence)
    await options.savePending(null)
    pending = null
  }
  const exclusive = async (action: () => Promise<void>) => {
    if (retired) throw new Error('offline handle replaced')
    if (running) throw new Error('offline operation in progress')
    running = action()
    try { await running } finally { running = undefined }
  }
  const retry = (connection: Connection = options) => exclusive(async () => {
    if (pending) await options.savePending(pending)
    await deliver(connection)
  })
  state.flushes.set(options.attempt.attemptId, {
    flush: async connection => {
      // A failed request may still have committed; retry its original ID.
      if (running) await running.catch(() => {})
      await retry(connection)
    },
    replace: incoming => {
      if (pending && incoming && JSON.stringify(pending) !== JSON.stringify(incoming)) throw new Error('pending checkpoint conflict')
      if (running) throw new Error('offline operation in progress')
      retired = true
      return pending
    },
  })
  return {
    record: (input: LearningRecord) => exclusive(async () => {
      if (state.phase !== 'active') throw new Error('local session sealing or sealed')
      if (pending) throw new Error('retry pending record first')
      pending = offlineRecordSchema.parse({ ...learningRecordSchema.parse(input), eventId: crypto.randomUUID(), sequence: sequence + 1 })
      await options.savePending(pending)
      await deliver()
    }),
    retry: () => retry(),
  }
}
function delay(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
/** Explicitly seals this session. Start a new local session for subsequent play. */
export async function synchronizeOfflineSession(options: Connection & {
  getClerkToken: () => Promise<string | null>; onState?: (state: OfflineSyncState) => void; retryDelayMs?: number; maxRetries?: number
}): Promise<void> {
  const state = work(options)
  if (state.phase === 'syncing') throw new Error('session synchronization in progress')
  const previous = state.phase
  state.phase = 'syncing'
  try {
    await Promise.all(state.opening)
    for (const attempt of state.flushes.values()) await attempt.flush(options)
  } catch (error) { state.phase = previous; throw error }
  // A lost response can mean that SQLite already sealed; never reopen for writes.
  let retries = 0, requestedSeal = false
  try { for (;;) {
    options.signal?.throwIfAborted()
    try {
      const token = await options.getClerkToken()
      if (!token) throw new OfflineProgressError(401, 'login_required', 'login required')
      options.signal?.throwIfAborted()
      requestedSeal = true
      const value = await request(options, 'sync', {}, token)
      if (!Number.isSafeInteger(value.pendingEvents) || Number(value.pendingEvents) < 0) throw new OfflineProgressError(503, 'pending', 'invalid gateway receipt')
      const state = value.pendingEvents === 0 ? 'synchronized' : 'pending'
      options.onState?.(state)
      if (state === 'synchronized') { sessions.delete(`${options.origin}\0${options.session.token}`); return }
      retries = 0
    } catch (error) {
      if (!(error instanceof OfflineProgressError)) throw error
      options.onState?.(error.state)
      if (error.state !== 'pending' || ![429, 503].includes(error.status) || retries >= (options.maxRetries ?? 8)) throw error
      await delay(Math.min(30000, (options.retryDelayMs ?? 1000) * 2 ** retries++), options.signal)
    }
  } } finally { state.phase = requestedSeal ? 'sealed' : previous }
}
