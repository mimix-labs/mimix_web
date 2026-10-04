import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  @Get()
  @ApiOkResponse({ schema: { type: 'object', required: ['status', 'project'], properties: { status: { type: 'string', enum: ['ok'] }, project: { type: 'string', enum: ['mimix'] } } } })
  health(): { status: string; project: string } {
    return { status: 'ok', project: 'mimix' }
  }
}
