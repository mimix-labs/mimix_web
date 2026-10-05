import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { DeviceRequest } from '../devices/http.js'
import { MediaHttp } from './http.js'
@Controller('api/media')
export class MediaController {
  constructor(@Inject(MediaHttp) private readonly http: MediaHttp) {}
  private async respond(reply: FastifyReply, result: ReturnType<MediaHttp['execute']>) { const response = await result; return reply.code(response.status).send(response.body) }
  @Post('sessions')
  @SetMetadata('identity:user', true)
  create(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Body() body: unknown) { return this.respond(reply, this.http.execute('create', req, body, '')) }
  @Get('sessions')
  @SetMetadata('identity:user', true)
  list(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Query() query: unknown) { return this.respond(reply, this.http.execute('list', req, query, '')) }
  @Get('sessions/:id')
  @SetMetadata('identity:user', true)
  get(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string) { return this.respond(reply, this.http.execute('get', req, undefined, id)) }
  @Delete('sessions/:id')
  @SetMetadata('identity:user', true)
  close(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string) { return this.respond(reply, this.http.execute('close', req, undefined, id)) }
  @Post('sessions/:id/user-token')
  @SetMetadata('identity:user', true)
  user_token(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string, @Body() body: unknown) { return this.respond(reply, this.http.execute('user-token', req, body, id)) }
  @Post('sessions/:id/device-token')
  @SetMetadata('identity:public', true)
  device_token(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string, @Body() body: unknown) { return this.respond(reply, this.http.execute('device-token', req, body, id)) }
  @Post('sessions/:id/disconnect')
  @SetMetadata('identity:public', true)
  disconnect(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string, @Body() body: unknown) { return this.respond(reply, this.http.execute('disconnect', req, body, id)) }
}
