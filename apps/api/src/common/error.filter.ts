import { DeviceError } from '../modules/devices/contract.js'
import { VoiceHttpError } from '../modules/voice/http.js'
import { LearningError } from '../modules/learning/contract.js'
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    const request = host.switchToHttp().getRequest<FastifyRequest>()
    const status = (exception instanceof DeviceError || exception instanceof LearningError || exception instanceof VoiceHttpError) ? exception.status : exception instanceof HttpException ? exception.getStatus() : 500
    request.log.error({ event: 'request-error', status, requestId: request.id })
    if (reply.sent) return
    const error = (exception instanceof DeviceError || exception instanceof LearningError || exception instanceof VoiceHttpError) ? exception.message : status === 404 ? 'not found' : status < 500 ? 'invalid request' : 'internal server error'
    void reply.code(status).send({ error })
  }
}
