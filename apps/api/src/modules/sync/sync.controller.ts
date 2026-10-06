import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { User } from '../identity/identity.contract.js'
import { SyncService, type LocalAction } from './service.js'
@Controller('api/offline')
export class OfflineController {
  constructor(@Inject(SyncService) private readonly service: SyncService) {}
  private async local(action: LocalAction, auth: string | undefined, token: string | undefined, body: unknown, reply: FastifyReply) {
    const result = await this.service.localRequest(action, auth, token, body)
    return reply.code(result.status).send(result.body)
  }
  @Post('sessions') @SetMetadata('identity:public', true)
  create(@Body() body: unknown, @Res() reply: FastifyReply) { return this.local('session', undefined, undefined, body, reply) }
  @Post('attempts') @SetMetadata('identity:public', true)
  attempt(@Headers('authorization') auth: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.local('attempt', auth, undefined, body, reply) }
  @Post('events') @SetMetadata('identity:public', true)
  event(@Headers('authorization') auth: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.local('event', auth, undefined, body, reply) }
  @Get('status') @SetMetadata('identity:public', true)
  status(@Headers('authorization') auth: string, @Res() reply: FastifyReply) { return this.local('status', auth, undefined, undefined, reply) }
  @Post('bind') @SetMetadata('identity:public', true)
  bind(@Headers('authorization') auth: string, @Headers('x-mimix-sync-token') token: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.local('bind', auth, token, body, reply) }
  @Post('sync') @SetMetadata('identity:public', true)
  sync(@Headers('authorization') auth: string, @Headers('x-mimix-sync-token') token: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.local('sync', auth, token, body, reply) }
}
@Controller('api/sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly service: SyncService) {}
  @Post('bind') @HttpCode(200) @SetMetadata('identity:user', true)
  bind(@Req() req: { user: User }, @Body() body: unknown) { return this.service.cloudRequest('bind', req.user.id, body) }
  @Post('batch') @HttpCode(200) @SetMetadata('identity:user', true)
  batch(@Req() req: { user: User }, @Body() body: unknown) { return this.service.cloudRequest('batch', req.user.id, body) }
}
