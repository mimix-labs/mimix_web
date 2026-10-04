import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.get<boolean>('identity:public', context.getHandler())) return true
    if (this.reflector.get<boolean>('identity:user', context.getHandler()) && context.switchToHttp().getRequest<{ user?: unknown }>().user) return true
    throw new UnauthorizedException()
  }
}
