import { Body, Controller, Delete, Inject, Param, Post, Query, Req, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '../identity/identity.contract.js'
import { VoiceHttp } from './http.js'
@Controller('api/voice/utterances')
export class VoiceController {
  constructor(@Inject(VoiceHttp) private readonly http: VoiceHttp) {}
  @Post()
  @SetMetadata('identity:user', true)
  async speak(@Req() req: FastifyRequest & { user: User }, @Body() input: unknown, @Query() query: unknown, @Res() reply: FastifyReply) {
    const controller = new AbortController(), disconnect = () => controller.abort()
    reply.raw.once('close', disconnect)
    if (req.raw.aborted || reply.raw.destroyed) controller.abort()
    try {
      const result = await this.http.speak(req.user.id, input, query, controller.signal)
      if (!reply.raw.destroyed) return reply.code(200).send(result)
    }
    finally { reply.raw.off('close', disconnect) }
  }
  @Delete(':id')
  @SetMetadata('identity:user', true)
  cancel(@Req() req: { user: User }, @Param('id') id: string, @Query() query: unknown) { return this.http.cancel(req.user.id, id, query) }
}
