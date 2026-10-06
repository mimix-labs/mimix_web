import { z } from 'zod'
import { syncBindingSchema, syncReceiptSchema } from '@mimix/contracts'
import type { LocalStore } from './local-store.js'
import type { CloudSyncStore } from './cloud-store.js'
import { parseSync, SyncError } from './contract.js'
export type LocalAction = 'session' | 'attempt' | 'event' | 'status' | 'bind' | 'sync'
export class SyncService {
  constructor(private readonly local: LocalStore | undefined, private readonly cloud: CloudSyncStore | undefined, private readonly origin: string) {}
  private receipt<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new SyncError(503, 'cloud sync unavailable')
    return parsed.data
  }
  private async remote(path: string, token: string | undefined, body: unknown): Promise<unknown> {
    if (!token || !/^[^\s,]{1,8192}$/.test(token)) throw new SyncError(401, 'login required')
    if (!this.origin) throw new SyncError(503, 'cloud sync not configured')
    try {
      const response = await fetch(this.origin + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'error' })
      if (!response.ok) {
        await response.body?.cancel()
        const status = response.status
        throw new SyncError(status === 401 ? 401 : status === 409 ? 409 : status === 429 ? 429 : 503,
          status === 401 ? 'login required' : status === 409 ? 'sync conflict' : 'cloud sync unavailable')
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error()
      let text = '', bytes = 0
      const decoder = new TextDecoder()
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 16384) throw new Error()
          text += decoder.decode(chunk.value, { stream: true })
        }
        text += decoder.decode()
        return JSON.parse(text)
      } finally { await reader.cancel() }
    } catch (error) {
      if (error instanceof SyncError) throw error
      throw new SyncError(503, 'cloud sync unavailable')
    }
  }
  async localRequest(action: LocalAction, authorization: string | undefined, token: string | undefined, value?: unknown) {
    const local = this.local
    if (!local) throw new SyncError(503, 'offline storage unavailable')
    try {
      if (action === 'session') { parseSync(z.strictObject({}), value); return { status: 201, body: local.createSession() } }
      if (!authorization || !/^Local [A-Za-z0-9_-]{43}$/.test(authorization)) throw new SyncError(401, 'invalid local session')
      const capability = authorization.slice(6)
      if (action === 'status') return { status: 200, body: local.status(capability) }
      if (action === 'attempt') { const body = local.createAttempt(capability, value); return { status: body.duplicate ? 200 : 201, body } }
      if (action === 'event') { const body = local.append(capability, value); return { status: body.duplicate ? 200 : 201, body } }
      parseSync(z.strictObject({}), value)
      // Validate prerequisites before sealing; the seal is durable before any I/O.
      if (!token || !/^[^\s,]{1,8192}$/.test(token)) throw new SyncError(401, 'login required')
      if (!this.origin) throw new SyncError(503, 'cloud sync not configured')
      const claim = local.seal(capability)
      const binding = this.receipt(syncBindingSchema, await this.remote('/api/sync/bind', token, { sessionId: claim.sessionId, claimKey: claim.claimKey }))
      local.bind(capability, binding)
      if (action === 'sync') {
        const batch = local.batch(capability)
        if (batch) {
          const receipt = this.receipt(syncReceiptSchema, await this.remote('/api/sync/batch', token, batch))
          local.acknowledge(capability, batch, receipt)
        }
        local.prune(capability)
      }
      return { status: 200, body: local.status(capability) }
    } catch (error) {
      if (error instanceof SyncError) throw error
      throw new SyncError(503, 'offline storage unavailable')
    }
  }
  async cloudRequest(action: 'bind' | 'batch', userId: string, value: unknown) {
    if (!this.cloud) throw new SyncError(404, 'not found')
    try { return action === 'bind' ? await this.cloud.bind(userId, value) : await this.cloud.importBatch(userId, value) }
    catch (error) { if (error instanceof SyncError) throw error; throw new SyncError(503, 'cloud sync unavailable') }
  }
}
