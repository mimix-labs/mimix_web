import { z } from 'zod'
import { robotLeaseHeartbeatSchema } from '@mimix/robot-protocol'
import { DeviceError, parseDevice } from '../devices/contract.js'
import type { DeviceRequest } from '../devices/http.js'
import type { RobotControlService } from './service.js'
export type ControlAction = 'acquire' | 'heartbeat' | 'release' | 'session' | 'dispatch' | 'command' | 'audit'
export class RobotControlHttp {
  constructor(private readonly service?: RobotControlService) {}
  async execute(action: ControlAction, req: DeviceRequest, body?: unknown, id = '') {
    if (!this.service) throw new DeviceError(404, 'not found')
    if (!req.user || !req.identity) throw new DeviceError(401)
    const actor = { userId: req.user.id, identity: req.identity }
    try {
      switch (action) {
        case 'acquire': return { status: 201, body: await this.service.acquire(actor, body) }
        case 'heartbeat': parseDevice(robotLeaseHeartbeatSchema, body); return { status: 200, body: await this.service.heartbeat(actor, id) }
        case 'release': return { status: 200, body: await this.service.release(actor.userId, id) }
        case 'session': return { status: 200, body: await this.service.session(actor.userId, id) }
        case 'dispatch': return { status: 202, body: await this.service.dispatch(actor, body) }
        case 'command': return { status: 200, body: await this.service.command(actor.userId, id) }
        case 'audit': return { status: 200, body: await this.service.audit(actor.userId, parseDevice(z.strictObject({ after: z.string().optional() }), body).after) }
      }
    } catch (error) { if (error instanceof DeviceError) throw error; throw new DeviceError(503, 'robot control unavailable') }
  }
}
