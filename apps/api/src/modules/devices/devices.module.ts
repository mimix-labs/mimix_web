import { Module, type DynamicModule } from '@nestjs/common'
import { DevicesController } from './devices.controller.js'
import { DeviceHttp } from './http.js'
import type { DeviceStore } from './store.js'
@Module({})
export class DevicesModule {
  static register(store?: DeviceStore): DynamicModule {
    return { module: DevicesModule, controllers: [DevicesController], providers: [{ provide: DeviceHttp, useValue: new DeviceHttp(store) }] }
  }
}
