import { Controller, Get, Req, SetMetadata } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { User } from './identity.contract.js'

@ApiTags('identity')
@ApiBearerAuth()
@Controller('api/identity')
export class IdentityController {
  @Get('me')
  @SetMetadata('identity:user', true)
  @ApiOkResponse({ schema: { type: 'object', required: ['id', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' } } } })
  me(@Req() request: { user: User }): User { return request.user }
}
