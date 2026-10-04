import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { User } from '../identity/identity.contract.js'
import { LearningHttp } from './http.js'
@Controller('api/learning')
export class LearningController {
  constructor(@Inject(LearningHttp) private readonly http: LearningHttp) {}
  private async respond(reply: FastifyReply, result: ReturnType<LearningHttp['execute']>) { const response = await result; return reply.code(response.status).send(response.body) }
  @Post('attempts')
  @SetMetadata('identity:user', true)
  create(@Req() req: { user: User }, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('create', req.user.id, body)) }
  @Post('attempts/:id/events')
  @SetMetadata('identity:user', true)
  append(@Req() req: { user: User }, @Param('id') id: string, @Body() body: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('append', req.user.id, body, id)) }
  @Get('attempts/:id')
  @SetMetadata('identity:user', true)
  get(@Req() req: { user: User }, @Param('id') id: string, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('get', req.user.id, undefined, id)) }
  @Get('progress')
  @SetMetadata('identity:user', true)
  progress(@Req() req: { user: User }, @Query() query: unknown, @Res() reply: FastifyReply) { return this.respond(reply, this.http.execute('progress', req.user.id, query)) }
}
