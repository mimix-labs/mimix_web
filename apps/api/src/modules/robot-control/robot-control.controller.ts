import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { DeviceRequest } from '../devices/http.js'
import { RobotControlHttp } from './http.js'
@Controller('api/robot-control')
export class RobotControlController {
  constructor(@Inject(RobotControlHttp) private readonly http: RobotControlHttp) {}
  private async respond(reply: FastifyReply, result: ReturnType<RobotControlHttp['execute']>) { const response = await result; return reply.code(response.status).send(response.body) }
  @Post('leases')
  @SetMetadata('identity:user', true)
  acquire(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Body() body: unknown) { return this.respond(reply, this.http.execute('acquire', req, body, '')) }
  @Post('leases/:id/heartbeat')
  @SetMetadata('identity:user', true)
  heartbeat(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Body() body: unknown, @Param('id') id: string) { return this.respond(reply, this.http.execute('heartbeat', req, body, id)) }
  @Delete('leases/:id')
  @SetMetadata('identity:user', true)
  release(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string) { return this.respond(reply, this.http.execute('release', req, undefined, id)) }
  @Get('leases/:id')
  @SetMetadata('identity:user', true)
  session(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string) { return this.respond(reply, this.http.execute('session', req, undefined, id)) }
  @Post('intents')
  @SetMetadata('identity:user', true)
  dispatch(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Body() body: unknown) { return this.respond(reply, this.http.execute('dispatch', req, body, '')) }
  @Get('intents/:id')
  @SetMetadata('identity:user', true)
  command(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Param('id') id: string) { return this.respond(reply, this.http.execute('command', req, undefined, id)) }
  @Get('audit')
  @SetMetadata('identity:user', true)
  audit(@Req() req: DeviceRequest, @Res() reply: FastifyReply, @Query() query: unknown) { return this.respond(reply, this.http.execute('audit', req, query, '')) }
}
