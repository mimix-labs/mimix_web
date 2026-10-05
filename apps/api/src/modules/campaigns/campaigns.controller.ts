import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { User } from '../identity/identity.contract.js'
import { CampaignHttp } from './http.js'
@Controller('api/campaigns')
export class CampaignsController {
  constructor(@Inject(CampaignHttp) private readonly http: CampaignHttp) {}
  private async respond(reply: FastifyReply, result: ReturnType<CampaignHttp['execute']>) { const response = await result; return reply.code(response.status).send(response.body) }
  @Get()
  @SetMetadata('identity:user', true)
  list(@Req() req: { user: User }, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('list', req.user.id, {}, query)) }
  @Get(':id/versions/:version')
  @SetMetadata('identity:user', true)
  get(@Req() req: { user: User }, @Param() params: { id: string; version: string }, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('get', req.user.id, params, query)) }
  @Get(':id/versions/:version/progress')
  @SetMetadata('identity:user', true)
  progress(@Req() req: { user: User }, @Param() params: { id: string; version: string }, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('progress', req.user.id, params, query)) }
  @Post(':id/versions/:version/nodes/:nodeId/attempts')
  @SetMetadata('identity:user', true)
  start(@Req() req: { user: User }, @Param() params: { id: string; version: string; nodeId: string }, @Query() query: unknown, @Body() input: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('start', req.user.id, params, query, input)) }
}
