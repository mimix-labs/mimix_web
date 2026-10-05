import { z } from 'zod'
import { mediaTokenRequestSchema } from '@mimix/media-contract'
import { DeviceError, deviceToken } from '../devices/contract.js'
import type { DeviceRequest } from '../devices/http.js'
import { MediaError, parseMedia, type MediaService } from './service.js'
export type MediaAction = 'create' | 'list' | 'get' | 'close' | 'user-token' | 'device-token' | 'disconnect'
export class MediaHttp {
  constructor(private readonly service?: MediaService) {}
  async execute(action: MediaAction, request: DeviceRequest, input?: unknown, id = '') {
    if (!this.service) throw new MediaError(404, 'not found')
    try {
      if (action === 'device-token' || action === 'disconnect') {
        const header = request.headers.authorization ?? ''
        if (!header.startsWith('Device ') || !deviceToken.safeParse(header.slice(7)).success) throw new MediaError(401)
        parseMedia(mediaTokenRequestSchema, input)
        return { status: 200, body: action === 'device-token' ? await this.service.issueRobot(header.slice(7), id) : await this.service.disconnect(header.slice(7), id) }
      }
      if (!request.user || !request.identity) throw new MediaError(401)
      const actor = { userId: request.user.id, identity: request.identity }
      switch (action) {
        case 'create': { const body = await this.service.create(actor, input); return { status: body.status === 'ready' ? 201 : 200, body } }
        case 'list': return { status: 200, body: await this.service.list(actor.userId, parseMedia(z.strictObject({ after: z.string().optional() }), input).after) }
        case 'get': return { status: 200, body: await this.service.get(actor.userId, id) }
        case 'close': { const body = await this.service.close(actor.userId, id); return { status: body.state === 'closing' ? 202 : 200, body } }
        case 'user-token': parseMedia(mediaTokenRequestSchema, input); return { status: 200, body: await this.service.issueUser(actor, id) }
      }
    } catch (error) {
      if (error instanceof MediaError || error instanceof DeviceError) throw error
      throw new MediaError(503, 'media service unavailable')
    }
  }
}
