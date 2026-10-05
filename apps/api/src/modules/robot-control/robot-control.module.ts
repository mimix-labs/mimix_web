import { Module, type DynamicModule } from '@nestjs/common'
import { RobotControlController } from './robot-control.controller.js'
import { RobotControlHttp } from './http.js'
import type { RobotControlService } from './service.js'
@Module({})
export class RobotControlModule {
  static register(service?: RobotControlService): DynamicModule {
    return { module: RobotControlModule, controllers: [RobotControlController], providers: [{ provide: RobotControlHttp, useValue: new RobotControlHttp(service) }] }
  }
}
