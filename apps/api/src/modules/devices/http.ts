import { z } from 'zod'
import type { User, VerifiedIdentity } from '../identity/identity.contract.js'
import { DeviceError, deviceToken, parseDevice } from './contract.js'
import type { DeviceStore } from './store.js'
export type DeviceAction = 'pair' | 'cancel' | 'exchange' | 'list' | 'get' | 'revoke' | 'authorize' | 'self' | 'heartbeat' | 'disconnect' | 'audit'
export interface DeviceRequest { user?: User; identity?: VerifiedIdentity; headers: { authorization?: string } }
const querySchema = z.strictObject({ after: z.string().optional() })
export class DeviceHttp {
  constructor(private readonly store?: DeviceStore) {}
  async execute(action: DeviceAction, request: DeviceRequest, input?: unknown, id = '') {
    if (!this.store) throw new DeviceError(404, 'not found')
    try {
      if (action === 'exchange') return { status: 201, body: await this.store.exchange(input) }
      if (action === 'self' || action === 'heartbeat' || action === 'disconnect') {
        const authorization = request.headers.authorization ?? ''
        if (!authorization.startsWith('Device ') || !deviceToken.safeParse(authorization.slice(7)).success) throw new DeviceError(401)
        const token = authorization.slice(7)
        return { status: 200, body: action === 'self' ? await this.store.self(token) : await this.store[action](token, input) }
      }
      if (!request.user || !request.identity) throw new DeviceError(401)
      const actor = { userId: request.user.id, identity: request.identity }
      switch (action) {
        case 'pair': return { status: 201, body: await this.store.createPairing(actor, input) }
        case 'cancel': return { status: 200, body: await this.store.cancelPairing(actor.userId, id) }
        case 'list': return { status: 200, body: await this.store.list(actor.userId, parseDevice(querySchema, input).after) }
        case 'get': return { status: 200, body: await this.store.get(actor.userId, id) }
        case 'revoke': return { status: 200, body: await this.store.revoke(actor.userId, id) }
        case 'authorize': return { status: 200, body: await this.store.authorize(actor, id, input) }
        case 'audit': return { status: 200, body: await this.store.audit(actor.userId, parseDevice(querySchema, input).after) }
      }
    } catch (error) {
      if (error instanceof DeviceError) throw error
      throw new DeviceError(503, 'device service unavailable')
    }
  }
}
