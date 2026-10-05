import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { DeviceHttp, type DeviceRequest } from './http.js'
@Controller('api/devices')
export class DevicesController {
  constructor(@Inject(DeviceHttp) private readonly http: DeviceHttp) {}
  private async respond(reply: FastifyReply, result: ReturnType<DeviceHttp['execute']>) { const response = await result; return reply.code(response.status).send(response.body) }
  @Post('pairings')
  @SetMetadata('identity:user', true)
  pair(@Req() req: DeviceRequest, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('pair', req, body)) }
  @Delete('pairings/:id')
  @SetMetadata('identity:user', true)
  cancel(@Req() req: DeviceRequest, @Param('id') id: string, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('cancel', req, undefined, id)) }
  @Post('exchange')
  @SetMetadata('identity:public', true)
  exchange(@Req() req: DeviceRequest, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('exchange', req, body)) }
  @Get('sessions')
  @SetMetadata('identity:user', true)
  list(@Req() req: DeviceRequest, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('list', req, query)) }
  @Get('sessions/:id')
  @SetMetadata('identity:user', true)
  get(@Req() req: DeviceRequest, @Param('id') id: string, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('get', req, undefined, id)) }
  @Delete('sessions/:id')
  @SetMetadata('identity:user', true)
  revoke(@Req() req: DeviceRequest, @Param('id') id: string, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('revoke', req, undefined, id)) }
  @Post('sessions/:id/authorize')
  @SetMetadata('identity:user', true)
  authorize(@Req() req: DeviceRequest, @Param('id') id: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('authorize', req, body, id)) }
  @Get('self')
  @SetMetadata('identity:public', true)
  self(@Req() req: DeviceRequest, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('self', req, undefined)) }
  @Post('heartbeat')
  @SetMetadata('identity:public', true)
  heartbeat(@Req() req: DeviceRequest, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('heartbeat', req, body)) }
  @Post('disconnect')
  @SetMetadata('identity:public', true)
  disconnect(@Req() req: DeviceRequest, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('disconnect', req, body)) }
  @Get('audit')
  @SetMetadata('identity:user', true)
  audit(@Req() req: DeviceRequest, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('audit', req, query)) }
}
