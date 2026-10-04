import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { IdentityController } from './identity.controller.js'
import { IdentityGuard } from './identity.guard.js'
@Module({ controllers: [IdentityController], providers: [{ provide: APP_GUARD, useClass: IdentityGuard }] })
export class IdentityModule {}
